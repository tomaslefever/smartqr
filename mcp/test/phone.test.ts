import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.js';

test('WhatsApp numbers in any common shape become +digits', () => {
    for (const raw of ['+56 9 1234 5678', '56912345678', '0056912345678', '56912345678@s.whatsapp.net', '+56-9-1234-5678']) {
        assert.equal(normalizePhone(raw), '+56912345678', raw);
    }
});

// A local number without its country code ("912345678") cannot be told apart from a valid foreign one
// (+91…), so it is not rejected here; WhatsApp always gives the full number
test('numbers starting with a trunk 0 or with the wrong length are rejected', () => {
    for (const raw of ['1234', '09 1234 5678', '+1234567890123456', '']) {
        assert.throws(() => normalizePhone(raw), /no es un número de WhatsApp válido/, raw);
    }
});
