#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Setting up WhatsApp Chatbot SaaS dev environment"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is not installed. Install Node.js (18+) before continuing."
  exit 1
fi

echo "📦 Installing dependencies..."
npm install

if [ ! -f ".env" ]; then
  echo "📝 Creating .env from template..."
  cp .env.example .env
  echo "   -> Update .env with your WHATSAPP_VERIFY_TOKEN, WABA_TOKEN, PHONE_NUMBER_ID,"
  echo "      GRAPH_VERSION, and APP_SECRET before running the server."
else
  echo "✅ .env already exists. Skipping copy."
fi

echo "🔍 Quick health checklist:"
echo "   1. Start the server: npm run dev"
echo "   2. Expose via tunnel: npx ngrok http 3000"
echo "   3. Verify Meta webhook: https://<ngrok-url>/webhook responds with 200"
echo "   4. Send test message from WhatsApp sandbox to confirm bot replies"

echo ""
echo "Done! Next steps:"
echo " - Update .env with real sandbox credentials."
echo " - In Meta App → WhatsApp: set Webhook URL to https://<ngrok-url>/webhook"
echo " - Subscribe to messages, message_status, message_template_status_update."
echo ""
echo "Happy building! ✨"
