import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Test adding a customer
Clarinet.test({
    name: "Ensure that users can add themselves as customers",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        
        const name = "John Doe";
        const dateOfBirth = 946684800; // Unix timestamp for 2000-01-01
        const residenceCountry = "United States";
        
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8(name),
                    types.uint(dateOfBirth),
                    types.utf8(residenceCountry)
                ],
                user1.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u1)');
        
        // Check customer details
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-details',
            [types.uint(1)],
            deployer.address
        );
        
        const result = call.result.replace(/\s+/g, ' ').trim();
        
        // Verify customer data
        assertEquals(result.includes(`address: ${user1.address}`), true);
        assertEquals(result.includes(`name: "${name}"`), true);
        assertEquals(result.includes(`date-of-birth: u${dateOfBirth}`), true);
        assertEquals(result.includes(`residence-country: "${residenceCountry}"`), true);
        assertEquals(result.includes(`is-verified: false`), true);
        assertEquals(result.includes(`kyc-level: u0`), true);
    },
});

// Test adding a business and business approval
Clarinet.test({
    name: "Ensure that contract owner can approve businesses",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const business = accounts.get('wallet_2')!;
        
        const businessName = "KYC Services Inc.";
        const businessType = "Financial Services";
        
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8(businessName),
                    types.utf8(businessType)
                ],
                deployer.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u1)');
        
        // Check business details
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-business-details',
            [types.uint(1)],
            deployer.address
        );
        
        const result = call.result.replace(/\s+/g, ' ').trim();
        
        // Verify business data
        assertEquals(result.includes(`address: ${business.address}`), true);
        assertEquals(result.includes(`name: "${businessName}"`), true);
        assertEquals(result.includes(`is-approved: true`), true);
        assertEquals(result.includes(`business-type: "${businessType}"`), true);
        
        // Check business approval status
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'is-business-approved',
            [types.uint(1)],
            deployer.address
        );
        
        assertEquals(call.result, 'true');
    },
});

// Test unauthorizing adding a business
Clarinet.test({
    name: "Ensure that non-owners cannot approve businesses",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const business = accounts.get('wallet_2')!;
        const nonOwner = accounts.get('wallet_3')!;
        
        const businessName = "KYC Services Inc.";
        const businessType = "Financial Services";
        
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8(businessName),
                    types.utf8(businessType)
                ],
                nonOwner.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-unauthorized
    },
});

// Test verifying a customer
Clarinet.test({
    name: "Ensure that approved businesses can verify customers",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const business = accounts.get('wallet_2')!;
        
        // Setup - add customer and approve business
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Jane Smith"),
                    types.uint(946684800),
                    types.utf8("Canada")
                ],
                user1.address
            ),
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8("KYC Services Inc."),
                    types.utf8("Financial Services")
                ],
                deployer.address
            )
        ]);
        
        // Verify the customer
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(1), // customer-id
                    types.uint(1)  // business-id
                ],
                business.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
        
        // Check customer verification status
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'is-customer-verified',
            [types.uint(1)],
            deployer.address
        );
        
        assertEquals(call.result, 'true');
        
        // Check customer details for verification date
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-details',
            [types.uint(1)],
            deployer.address
        );
        
        const result = call.result.replace(/\s+/g, ' ').trim();
        assertEquals(result.includes(`is-verified: true`), true);
        assertEquals(result.includes(`verification-date: u`), true);
    },
});

// Test verifying from a non-approved business
Clarinet.test({
    name: "Ensure that non-approved businesses cannot verify customers",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const nonApprovedBusiness = accounts.get('wallet_3')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Alice Johnson"),
                    types.uint(946684800),
                    types.utf8("Germany")
                ],
                user1.address
            )
        ]);
        
        // Try to verify customer from non-approved business
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(1), // customer-id
                    types.uint(999)  // non-existent business-id
                ],
                nonApprovedBusiness.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-unauthorized
    },
});

// Test revoking a business approval
Clarinet.test({
    name: "Ensure that contract owner can revoke business approval",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const business = accounts.get('wallet_2')!;
        
        // Setup - approve business
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8("KYC Services Inc."),
                    types.utf8("Financial Services")
                ],
                deployer.address
            )
        ]);
        
        // Check initial approval status
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'is-business-approved',
            [types.uint(1)],
            deployer.address
        );
        
        assertEquals(call.result, 'true');
        
        // Revoke business approval
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'revoke-business',
                [types.uint(1)],
                deployer.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
        
        // Check updated approval status
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'is-business-approved',
            [types.uint(1)],
            deployer.address
        );
        
        assertEquals(call.result, 'false');
    },
});

// Test updating KYC level
Clarinet.test({
    name: "Ensure that contract owner can update customer KYC level",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Bob Williams"),
                    types.uint(946684800),
                    types.utf8("Australia")
                ],
                user1.address
            )
        ]);
        
        // Update KYC level
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'update-kyc-level',
                [
                    types.uint(1), // customer-id
                    types.uint(2)  // new KYC level
                ],
                deployer.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
        
        // Check updated KYC level
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-kyc-level',
            [types.uint(1)],
            deployer.address
        );
        
        assertEquals(call.result, '(some u2)');
    },
});

// Test invalid KYC level update
Clarinet.test({
    name: "Ensure that invalid KYC levels are rejected",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Charlie Brown"),
                    types.uint(946684800),
                    types.utf8("UK")
                ],
                user1.address
            )
        ]);
        
        // Try to update with invalid KYC level
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'update-kyc-level',
                [
                    types.uint(1), // customer-id
                    types.uint(4)  // invalid level (only 1-3 allowed)
                ],
                deployer.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u104)'); // err-invalid-kyc-level
    },
});

// Test document upload
Clarinet.test({
    name: "Ensure that customers can upload their documents",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("David Wilson"),
                    types.uint(946684800),
                    types.utf8("Japan")
                ],
                user1.address
            )
        ]);
        
        // Upload document
        const documentType = "passport";
        const documentHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
        
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(1), // customer-id
                    types.utf8(documentType),
                    types.buff(documentHash)
                ],
                user1.address
            )
        ]);
        
        // Check successful response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
        
        // Check document details
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-document',
            [
                types.uint(1),
                types.utf8(documentType)
            ],
            deployer.address
        );
        
        const result = call.result.replace(/\s+/g, ' ').trim();
        
        // Verify document hash is stored correctly
        assertEquals(result.includes(documentHash.replace('0x', '')), true);
    },
});

// Test unauthorized document upload
Clarinet.test({
    name: "Ensure that only the customer can upload their own documents",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Eve Davis"),
                    types.uint(946684800),
                    types.utf8("France")
                ],
                user1.address
            )
        ]);
        
        // Try to upload document for another user
        const documentType = "drivers_license";
        const documentHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
        
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(1), // customer-id
                    types.utf8(documentType),
                    types.buff(documentHash)
                ],
                user2.address // Not the customer
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-unauthorized
    },
});

// Test duplicate document upload
Clarinet.test({
    name: "Ensure that duplicate document uploads are rejected",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        
        // Setup - add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Frank Miller"),
                    types.uint(946684800),
                    types.utf8("Brazil")
                ],
                user1.address
            )
        ]);
        
        // Upload document
        const documentType = "national_id";
        const documentHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
        
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(1), // customer-id
                    types.utf8(documentType),
                    types.buff(documentHash)
                ],
                user1.address
            )
        ]);
        
        // Try to upload the same document type again
        const newDocumentHash = "0x9876543210987654321098765432109876543210987654321098765432109876";
        
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(1), // customer-id
                    types.utf8(documentType), // Same document type
                    types.buff(newDocumentHash)
                ],
                user1.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u105)'); // err-document-already-exists
    },
});

// Test attempting to verify an already verified customer
Clarinet.test({
    name: "Ensure that already verified customers cannot be verified again",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const business = accounts.get('wallet_2')!;
        
        // Setup - add customer and approve business
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Grace Lee"),
                    types.uint(946684800),
                    types.utf8("South Korea")
                ],
                user1.address
            ),
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8("KYC Experts"),
                    types.utf8("Financial Services")
                ],
                deployer.address
            )
        ]);
        
        // Verify the customer
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(1), // customer-id
                    types.uint(1)  // business-id
                ],
                business.address
            )
        ]);
        
        // Try to verify again
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(1), // customer-id
                    types.uint(1)  // business-id
                ],
                business.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u103)'); // err-already-verified
    },
});

// Test verifying a non-existent customer
Clarinet.test({
    name: "Ensure that non-existent customers cannot be verified",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const business = accounts.get('wallet_2')!;
        
        // Setup - approve business
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8("KYC Experts"),
                    types.utf8("Financial Services")
                ],
                deployer.address
            )
        ]);
        
        // Try to verify non-existent customer
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(999), // non-existent customer-id
                    types.uint(1)   // business-id
                ],
                business.address
            )
        ]);
        
        // Check for error response
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-not-found
    },
});

// Test full KYC process
Clarinet.test({
    name: "Test full KYC process workflow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const customer = accounts.get('wallet_1')!;
        const business = accounts.get('wallet_2')!;
        
        // Step 1: Add customer
        let block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'add-customer',
                [
                    types.utf8("Henry Johnson"),
                    types.uint(946684800),
                    types.utf8("Sweden")
                ],
                customer.address
            )
        ]);
        
        const customerId = 1;
        
        // Step 2: Customer uploads documents
        const passportHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        const idCardHash = "0x0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba";
        
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(customerId),
                    types.utf8("passport"),
                    types.buff(passportHash)
                ],
                customer.address
            ),
            Tx.contractCall(
                'kyc-contract',
                'upload-customer-document',
                [
                    types.uint(customerId),
                    types.utf8("id_card"),
                    types.buff(idCardHash)
                ],
                customer.address
            )
        ]);
        
        // Step 3: Approve business
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'approve-business',
                [
                    types.principal(business.address),
                    types.utf8("Global KYC Solutions"),
                    types.utf8("Financial Services")
                ],
                deployer.address
            )
        ]);
        
        const businessId = 1;
        
        // Step 4: Business verifies customer
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'verify-customer',
                [
                    types.uint(customerId),
                    types.uint(businessId)
                ],
                business.address
            )
        ]);
        
        // Step 5: Contract owner updates KYC level
        block = chain.mineBlock([
            Tx.contractCall(
                'kyc-contract',
                'update-kyc-level',
                [
                    types.uint(customerId),
                    types.uint(2) // Level 2 KYC
                ],
                deployer.address
            )
        ]);
        
        // Check final state
        
        // Verify customer is verified
        let call = chain.callReadOnlyFn(
            'kyc-contract',
            'is-customer-verified',
            [types.uint(customerId)],
            deployer.address
        );
        
        assertEquals(call.result, 'true');
        
        // Verify KYC level
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-kyc-level',
            [types.uint(customerId)],
            deployer.address
        );
        
        assertEquals(call.result, '(some u2)');
        
        // Verify document is stored
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-document',
            [
                types.uint(customerId),
                types.utf8("passport")
            ],
            deployer.address
        );
        
        const passportResult = call.result.replace(/\s+/g, ' ').trim();
        assertEquals(passportResult.includes(passportHash.replace('0x', '')), true);
        
        call = chain.callReadOnlyFn(
            'kyc-contract',
            'get-customer-document',
            [
                types.uint(customerId),
                types.utf8("id_card")
            ],
            deployer.address
        );
        
        const idCardResult = call.result.replace(/\s+/g, ' ').trim();
        assertEquals(idCardResult.includes(idCardHash.replace('0x', '')), true);
    },
});