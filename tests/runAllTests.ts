import './setupEnv.js';
import { createApp } from '../src/app.js';
import { hashApiKey } from '../src/lib/crypto.js';
import { MessagesService } from '../src/modules/messages/messages.service.js';
import { AutomationsService } from '../src/modules/automations/automations.service.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 Running TFC WhatsApp Automation Service Test Suite...\n');

  // 1. Phone Number Normalization Tests
  console.log('--- Phone Number Normalizer ---');
  assert(MessagesService.cleanPhoneNumber('03001234567') === '923001234567', 'Normalizes 03xx to 923xx');
  assert(MessagesService.cleanPhoneNumber('+92-300-1234567') === '923001234567', 'Strips dashes and + symbol');
  assert(MessagesService.cleanPhoneNumber('00923001234567') === '923001234567', 'Strips leading 0092');

  // 2. Cryptography & Hashing Tests
  console.log('\n--- Cryptography & Hashing ---');
  const hash1 = hashApiKey('my-secret-key');
  const hash2 = hashApiKey('my-secret-key');
  const hash3 = hashApiKey('different-key');
  assert(hash1 === hash2, 'SHA-256 hash is deterministic');
  assert(hash1 !== hash3, 'Different keys produce different hashes');

  // 3. Automation Template Interpolation Tests
  console.log('\n--- Automation Template Engine ---');
  const template = 'Dear {{parentName}}, fee of Rs. {{amount}} is due for {{studentName}}.';
  const rendered = AutomationsService.renderTemplate(template, {
    parentName: 'Mr. Tariq',
    amount: '6,500',
    studentName: 'Hamza Tariq'
  });
  assert(
    rendered === 'Dear Mr. Tariq, fee of Rs. 6,500 is due for Hamza Tariq.',
    'Interpolates {{variable}} placeholders accurately'
  );

  // 4. API Express App Creation Test
  console.log('\n--- API Express App Initializer ---');
  const app = createApp();
  assert(typeof app === 'function', 'Express application created successfully');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
