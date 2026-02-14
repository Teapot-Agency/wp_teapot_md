#!/bin/bash
# Batch generate featured images for all blog articles
# Uses the existing generate_images.py with --placement manual --featured
# Each article gets an SEO-friendly image filename via -n

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"
GEN_SCRIPT="$SCRIPT_DIR/generate_images.py"
BLOG_DIR="$SCRIPT_DIR/../blog"

# Load .env if present
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a
fi

export GEMINI_API_KEY="${GEMINI_API_KEY:?Set GEMINI_API_KEY env var or create .env file}"

run() {
    local file="$1"
    shift
    echo ""
    echo "=========================================="
    echo "Processing: $(basename "$file")"
    echo "=========================================="
    "$VENV_PYTHON" "$GEN_SCRIPT" "$file" --placement manual --featured "$@"
}

run "$BLOG_DIR/commerce-engine-supplement-marketing.md" \
    -n "ai-supplement-commerce-analytics" \
    -p "Futuristic data-driven supplement commerce dashboard with AI analytics, conversion funnels, and performance metrics overlaid on modern wellness product imagery"

run "$BLOG_DIR/death-of-prescription.md" \
    -n "prescription-to-otc-medicine-cabinet" \
    -p "Modern medicine cabinet transformation showing the shift from prescription-only drugs to accessible OTC products with smart digital labels and self-care tools"

run "$BLOG_DIR/end-of-tv-pill-ad.md" \
    -n "tv-pill-ad-to-digital-health" \
    -p "An old television set displaying a pill advertisement dissolving into digital particles, transforming into a smartphone with modern health content and community engagement"

run "$BLOG_DIR/future-of-pharma-2030.md" \
    -n "pharma-2030-dna-data-innovation" \
    -p "Futuristic pharmaceutical visualization showing DNA helix intertwined with digital data streams, wearable health devices, and AI neural network patterns for healthcare 2030"

run "$BLOG_DIR/new-pharma-playbook.md" \
    -n "pharma-strategy-digital-playbook" \
    -p "A strategic playbook or blueprint transforming from old paper pages into a holographic digital display showing pharmaceutical strategy diagrams and digital engagement flows"

run "$BLOG_DIR/pharma-marketing-lifecycle.md" \
    -n "pharmaceutical-lifecycle-diagram" \
    -p "An elegant circular lifecycle diagram showing the pharmaceutical journey from lab discovery through clinical trials, market launch, peak sales, to patent expiry and generic competition"

run "$BLOG_DIR/pharma01.md" \
    -n "ai-algoritmy-farmaceuticky-marketing" \
    -p "A doctor silhouette overlaid with flowing data streams, neural network patterns, and medical symbols representing algorithms in modern medicine and AI-driven healthcare"

run "$BLOG_DIR/self-care-revolution.md" \
    -n "smart-self-care-medicine-cabinet" \
    -p "A high-tech modern medicine cabinet reimagined as a self-care station with smart pill bottles, digital health app on smartphone, and innovative OTC wellness products"

run "$BLOG_DIR/supplement-advertising-rules.md" \
    -n "supplement-compliance-ftc-balance" \
    -p "Balanced scale of justice with supplement bottles on one side and regulatory compliance documents and FTC papers on the other, with clinical trial data in the background"

run "$BLOG_DIR/supplement-marketing-mistakes.md" \
    -n "supplement-marketing-regulatory-risk" \
    -p "Supplement bottles arranged like dominos about to topple with one already fallen revealing a red warning label, surrounded by marketing documents with red X marks — cautionary editorial"

run "$BLOG_DIR/voucher-revolution-pharma-marketing.md" \
    -n "eu-pharma-exclusivity-voucher" \
    -p "A golden transferable exclusivity voucher being exchanged between pharmaceutical entities against a backdrop of EU regulatory buildings and digital healthcare professional engagement screens"

echo ""
echo "=========================================="
echo "ALL DONE"
echo "=========================================="
