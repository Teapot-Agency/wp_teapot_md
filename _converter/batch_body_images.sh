#!/bin/bash
# Generate 2 body images per blog article (parallel workers)
# Uses --no-featured to preserve existing featured images
# Uses --placement before-sections to auto-insert into markdown body

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

MAX_PARALLEL=4
RUNNING=0
PIDS=()

run_parallel() {
    local file="$1"
    shift
    echo "[START] $(basename "$file")"
    "$VENV_PYTHON" "$GEN_SCRIPT" "$file" --placement before-sections --no-featured "$@" &
    PIDS+=($!)
    RUNNING=$((RUNNING + 1))

    if [ "$RUNNING" -ge "$MAX_PARALLEL" ]; then
        # Wait for any one to finish
        wait -n 2>/dev/null || wait "${PIDS[0]}"
        RUNNING=$((RUNNING - 1))
    fi
}

# 1. Commerce Engine Supplement Marketing
run_parallel "$BLOG_DIR/commerce-engine-supplement-marketing.md" \
    -p "Micro-influencer filming a supplement product review in a home studio with real-time engagement analytics, conversion metrics, and ROI data overlaid on screen" \
       "AI-powered personalized nutrition dashboard showing DNA helix, wearable device data streams, microbiome analysis, and adaptive supplement dosage recommendations" \
    -n "micro-creator-supplement-analytics" \
       "ai-personalized-nutrition-dashboard"

# 2. Death of Prescription
run_parallel "$BLOG_DIR/death-of-prescription.md" \
    -p "FDA Rx-to-OTC switch approval process visualization with pill bottle transforming from prescription label to over-the-counter retail packaging on pharmacy shelf" \
       "AI-powered digital pharmacist kiosk in modern pharmacy with interactive health screening questionnaire on touchscreen, replacing traditional doctor consultation" \
    -n "rx-to-otc-switch-process" \
       "ai-digital-pharmacist-kiosk"

# 3. End of TV Pill Ad
run_parallel "$BLOG_DIR/end-of-tv-pill-ad.md" \
    -p "Trusted community pharmacist consulting a patient across the counter in a modern neighborhood pharmacy, with digital health education screens in the background" \
       "Retail health ecosystem blending pharmacy counter with digital wellness screens, telehealth station, and smart product displays showing AI-personalized recommendations" \
    -n "community-pharmacist-patient-trust" \
       "retail-health-digital-ecosystem"

# 4. Future of Pharma 2030
run_parallel "$BLOG_DIR/future-of-pharma-2030.md" \
    -p "Dramatic patent cliff visualization showing blockbuster drug revenue columns crumbling at the edge while nichebuster precision therapies grow on the other side" \
       "AI-powered clinical decision support system integrated into a doctor electronic health record screen, showing predictive analytics and personalized treatment pathways" \
    -n "pharma-patent-cliff-nichebuster" \
       "ai-clinical-decision-ehr-support"

# Wait for first batch before continuing
wait
RUNNING=0
PIDS=()

# 5. New Pharma Playbook
run_parallel "$BLOG_DIR/new-pharma-playbook.md" \
    -p "Empowered patient as CEO of their health, using smartphone health apps with medical data, wearable devices, and digital tools for self-directed healthcare decisions" \
       "Optichannel precision marketing concept showing a single optimal message delivered to a physician at the exact clinical decision moment via the right digital channel" \
    -n "patient-ceo-digital-health-tools" \
       "optichannel-precision-physician-engagement"

# 6. Pharma Marketing Lifecycle
run_parallel "$BLOG_DIR/pharma-marketing-lifecycle.md" \
    -p "Patent thicket web of protection diagram with interlocking patent layers surrounding a central drug molecule, showing primary and secondary patent barriers" \
       "Three strategic archetypes timeline showing Innovator, Marketer, and Caretaker phases of drug lifecycle management with revenue curve overlay" \
    -n "patent-thicket-web-protection" \
       "drug-lifecycle-archetypes-timeline"

# 7. Pharma01 (Slovak article)
run_parallel "$BLOG_DIR/pharma01.md" \
    -p "Modern e-detailing video consultation between pharmaceutical representative and doctor on digital screen, replacing traditional in-person sales visit" \
       "Dark side of pharmaceutical marketing visualization showing rising prescription costs, patient financial burden, and telemedicine platform prescription gaps" \
    -n "e-detailing-video-konzultacia" \
       "naklady-na-lieky-temna-strana"

# 8. Self-Care Revolution
run_parallel "$BLOG_DIR/self-care-revolution.md" \
    -p "FDA ACNU digital guardrail concept with interactive pharmacy kiosk showing health screening questionnaire before authorizing OTC medication purchase" \
       "Global trade war impact on pharmacy showing tariff barriers, rising API costs from international supply chains, and medicine price increases on retail shelf" \
    -n "fda-acnu-digital-guardrail-kiosk" \
       "trade-war-pharmacy-price-impact"

# Wait for second batch
wait
RUNNING=0
PIDS=()

# 9. Supplement Advertising Rules
run_parallel "$BLOG_DIR/supplement-advertising-rules.md" \
    -p "TikTok Shop supplement commerce ecosystem with creator filming product review, real-time sales dashboard, and affiliate marketing analytics on screen" \
       "Supply chain traceability visualization showing ingredient journey from source farm through lab testing, certificate of analysis, to final supplement bottle" \
    -n "tiktok-shop-supplement-commerce" \
       "supplement-supply-chain-traceability"

# 10. Supplement Marketing Mistakes
run_parallel "$BLOG_DIR/supplement-marketing-mistakes.md" \
    -p "Audience segmentation diagram showing four distinct supplement consumer personas: busy professional, athlete, hormonal balance, biohacker, each with unique messaging" \
       "FDA enforcement action scene with misbranded supplement products receiving warning letters, showing the intended use doctrine and health claims violations" \
    -n "supplement-audience-segmentation" \
       "fda-enforcement-supplement-misbranding"

# 11. Voucher Revolution Pharma Marketing
run_parallel "$BLOG_DIR/voucher-revolution-pharma-marketing.md" \
    -p "Gen Z healthcare professional researching medical information on smartphone social media feeds, Reddit communities, and TikTok instead of traditional search engines" \
       "European Union regulatory patchwork map showing different pharmaceutical advertising rules per member state with geofencing compliance challenges" \
    -n "gen-z-hcp-social-media-research" \
       "eu-pharma-regulatory-patchwork-map"

# Wait for final batch
wait

echo ""
echo "=========================================="
echo "ALL DONE - 22 body images generated"
echo "=========================================="
