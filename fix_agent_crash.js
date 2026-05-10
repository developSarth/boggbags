const fs = require('fs');
const filePath = 'd:\\nodewave\\Assistant-Chatbot\\boggbags\\bogg bag bea.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const ag = data.nodes.find(n => n.name === 'AI Agent');

// ============================================================
// FIX 1: Agent prompt — Image_data references crash on text route
// ============================================================
// PROBLEM: $json.Image_data.image_type throws TypeError when 
// Image_data doesn't exist (normal text route via Write Redis Metadata).
// The agent ALWAYS errors before it can even call tools.
//
// FIX: Use a single conditional expression that only renders 
// Image_data when it exists. Uses optional chaining (?.) which 
// n8n expressions support.

ag.parameters.text = `=Customer Information:
Customer name: {{ $('Parse & Normalize.1.2').item.json.raw_payload.source.author.name }}
Customer email: {{ $('Parse & Normalize.1.2').item.json.raw_payload.source.author.email }}
Question: {{ $('Parse & Normalize.1.2').item.json.message_text }}
Language detected: {{ $('Parse & Normalize.1.2').item.json.raw_payload.custom_attributes.Language }}
{{ $json.Image_data ? 'Image Analysis:\\nType: ' + ($json.Image_data.image_type || 'unknown') + '\\nOrder #: ' + ($json.Image_data.extracted_order_number || 'N/A') + '\\nTracking #: ' + ($json.Image_data.extracted_tracking_number || 'N/A') + '\\nAmount: ' + ($json.Image_data.extracted_amount || 'N/A') + '\\nSummary: ' + ($json.Image_data.summary || 'N/A') + '\\nNeeds Escalation: ' + $json.Image_data.needs_escalation + '\\nDetails: ' + ($json.Image_data.enriched_message || '') : '' }}`;

console.log('✅ Fix 1: Agent prompt — Image_data references now use safe conditional');
console.log('   Before: 7 separate {{ $json.Image_data.X }} expressions (crash on text route)');
console.log('   After:  1 conditional expression that only renders when Image_data exists');

// ============================================================
// FIX 2: Connect error output to a fallback response
// ============================================================
// Currently onError: "continueErrorOutput" but error output (main[1])
// has no connection → errors silently die. Let's change to 
// "continueRegularOutput" so even if something goes wrong, the 
// agent still produces an output that flows to the escalation check.

ag.onError = 'continueRegularOutput';
console.log('✅ Fix 2: Agent onError changed from "continueErrorOutput" to "continueRegularOutput"');
console.log('   Before: errors silently stopped execution (error output unconnected)');
console.log('   After:  errors produce output and continue through the normal flow');

// ============================================================
// VERIFY: Print the fixed prompt
// ============================================================
console.log('\n=== FIXED PROMPT ===');
console.log(ag.parameters.text);

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('\n🎉 Fixes applied. The agent should now run tools correctly on text queries.');
