#!/usr/bin/env bash
# Audits the running dashboard end-to-end: starts the production server,
# exercises every route including error paths, then shuts it down.
set -u
cd "$(dirname "$0")/../apps/web"

PORT="${PORT:-3055}"
npx next start -p "$PORT" > /tmp/next-audit.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

# wait for readiness
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/briefs"; then break; fi
  sleep 0.5
done

PASS=0; FAIL=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1";
  else FAIL=$((FAIL+1)); echo "  FAIL $1 (expected $2, got $3)"; fi
}

echo "== radar page =="
CODE=$(curl -s -o /tmp/radar.html -w "%{http_code}" "http://localhost:$PORT/")
check "GET / status" 200 "$CODE"
TOPICS=$(grep -o 'brief-topic' /tmp/radar.html | wc -l)
check "radar renders briefs (>0)" "yes" "$([ "$TOPICS" -gt 0 ] && echo yes || echo no)"
HEAT=$(grep -o 'heat-fill' /tmp/radar.html | wc -l)
check "heat bars render" "yes" "$([ "$HEAT" -gt 0 ] && echo yes || echo no)"

echo "== briefs api =="
CODE=$(curl -s -o /tmp/briefs.json -w "%{http_code}" "http://localhost:$PORT/api/briefs")
check "GET /api/briefs status" 200 "$CODE"
BRIEF=$(node -e "const j=require('/tmp/briefs.json');const b=j.briefs.find(b=>b.status==='new');console.log(b?b.id:'')")
check "has a new brief" "yes" "$([ -n "$BRIEF" ] && echo yes || echo no)"

echo "== generate script =="
CODE=$(curl -s -o /tmp/gen.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/scripts" \
  -H "Content-Type: application/json" -d "{\"briefId\":\"$BRIEF\"}")
check "POST /api/scripts status" 200 "$CODE"
CID=$(node -e "const j=require('/tmp/gen.json');console.log(j.contentId||'')")
check "returns contentId" "yes" "$([ -n "$CID" ] && echo yes || echo no)"

echo "== script page =="
CODE=$(curl -s -o /tmp/script.html -w "%{http_code}" "http://localhost:$PORT/scripts/$CID")
check "GET /scripts/:id status" 200 "$CODE"
BEATS=$(grep -o 'beat-head' /tmp/script.html | wc -l)
check "beats render (>2)" "yes" "$([ "$BEATS" -gt 2 ] && echo yes || echo no)"
check "brief marked used" "yes" "$(curl -s "http://localhost:$PORT/api/briefs" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.briefs.find(b=>b.id==='$BRIEF').status==='used'?'yes':'no')})")"

echo "== status update =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/briefs" \
  -H "Content-Type: application/json" -d "{\"briefId\":\"$BRIEF\",\"status\":\"shortlisted\"}")
check "PATCH valid status" 200 "$CODE"

echo "== error paths =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/scripts" \
  -H "Content-Type: application/json" -d '{"briefId":"nope"}')
check "unknown brief -> 404" 404 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/briefs" \
  -H "Content-Type: application/json" -d '{"briefId":"x","status":"zzz"}')
check "invalid status -> 400" 400 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/scripts/not-a-real-id")
check "unknown script -> 404" 404 "$CODE"

echo "== phase 2: repurpose =="
CODE=$(curl -s -o /tmp/rep.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/repurpose" \
  -H "Content-Type: application/json" -d "{\"scriptId\":\"$CID\"}")
check "POST /api/repurpose status" 200 "$CODE"
NPOSTS=$(node -e "const j=require('/tmp/rep.json');console.log(j.results.filter(r=>r.ok).length)")
check "4 platform posts generated" 4 "$NPOSTS"
POSTID=$(node -e "const j=require('/tmp/rep.json');console.log(j.results[0].contentId)")

echo "== phase 2: studio renders on script page =="
curl -s "http://localhost:$PORT/scripts/$CID" > /tmp/script2.html
NCARDS=$(grep -o 'post-card' /tmp/script2.html | wc -l)
check "post cards render (>=4)" "yes" "$([ "$NCARDS" -ge 4 ] && echo yes || echo no)"

echo "== phase 2: approve/schedule workflow =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/content" \
  -H "Content-Type: application/json" -d "{\"contentId\":\"$POSTID\",\"action\":\"schedule\"}")
check "schedule before approve -> 400" 400 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/content" \
  -H "Content-Type: application/json" -d "{\"contentId\":\"$POSTID\",\"action\":\"approve\"}")
check "approve draft" 200 "$CODE"
CODE=$(curl -s -o /tmp/sched.json -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/content" \
  -H "Content-Type: application/json" -d "{\"contentId\":\"$POSTID\",\"action\":\"schedule\"}")
check "schedule approved post" 200 "$CODE"
MODE=$(node -e "const j=require('/tmp/sched.json');console.log(j.mode)")
check "postiz mock mode used" mock "$MODE"

echo "== phase 2: queue =="
curl -s "http://localhost:$PORT/queue" > /tmp/queue.html
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/queue")
check "GET /queue status" 200 "$CODE"
NQ=$(grep -o 'class="queue-row"' /tmp/queue.html | wc -l)
check "scheduled item appears in queue" "yes" "$([ "$NQ" -ge 1 ] && echo yes || echo no)"

echo "== phase 2: assets =="
CODE=$(curl -s -o /tmp/car.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/generate-assets" \
  -H "Content-Type: application/json" -d "{\"scriptId\":\"$CID\",\"mode\":\"carousel\"}")
check "generate carousel" 200 "$CODE"
NFILES=$(node -e "const j=require('/tmp/car.json');console.log(j.files.length)")
check "carousel has >=4 slides" "yes" "$([ "$NFILES" -ge 4 ] && echo yes || echo no)"
FILE=$(node -e "const j=require('/tmp/car.json');console.log(j.files[0])")
CTYPE=$(curl -s -o /tmp/a.png -w "%{content_type}" "http://localhost:$PORT/api/assets/$FILE")
check "asset served as png" "image/png" "$CTYPE"
MAGIC=$(head -c 4 /tmp/a.png | od -An -tx1 | tr -d ' \n')
check "asset is real PNG" "89504e47" "$MAGIC"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/assets/..%2F..%2Fetc%2Fpasswd.png")
check "path traversal blocked" 400 "$CODE"

echo "== phase 2: voices =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/voices")
check "GET /voices status" 200 "$CODE"
BRAND=$(curl -s "http://localhost:$PORT/api/brands" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).brands[0].id))")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" \
  -d "{\"brandId\":\"$BRAND\",\"voice_profile\":{\"identity\":\"updated\",\"audience\":\"devs\",\"vocabulary\":{\"use\":[],\"ban\":[\"synergy\"]}}}")
check "PATCH voice profile" 200 "$CODE"
BAN=$(curl -s "http://localhost:$PORT/api/brands" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).brands[0].voice_profile.vocabulary.ban[0]))")
check "voice change persisted" "synergy" "$BAN"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" -d "{\"brandId\":\"$BRAND\",\"voice_profile\":{\"identity\":123}}")
check "invalid voice rejected -> 400" 400 "$CODE"


echo "== phase 2.1: multi-brand =="
CODE=$(curl -s -o /tmp/newbrand.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" -d '{
    "name": "Fretwork Guitar",
    "positioning": "We teach working adults to finish learning guitar with 15-minute daily practice systems.",
    "sources": {"subreddits": ["guitarlessons"], "ytKeywords": ["learn guitar adult"], "keywords": ["guitar practice"]},
    "voice_profile": {"identity": "patient coach", "audience": "adult beginners"},
    "postiz_integrations": {"x": "int_guitar_x"}
  }')
check "create second brand -> 201" 201 "$CODE"
B2=$(node -e "const j=require('/tmp/newbrand.json');console.log(j.brand.id)")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" -d '{"name":"x","positioning":"short"}')
check "invalid brand -> 400" 400 "$CODE"

CODE=$(curl -s -o /tmp/radar2.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/radar" \
  -H "Content-Type: application/json" -d "{\"brandId\":\"$B2\"}")
check "run radar for new brand via UI api" 200 "$CODE"
NB=$(node -e "const j=require('/tmp/radar2.json');console.log(j.results[0].briefsWritten)")
check "new brand got briefs (>0)" "yes" "$([ "$NB" -gt 0 ] && echo yes || echo no)"

curl -s "http://localhost:$PORT/" > /tmp/radar_all.html
NTAG=$(grep -o 'brand-tag' /tmp/radar_all.html | wc -l)
check "all-brands view shows brand tags" "yes" "$([ "$NTAG" -gt 0 ] && echo yes || echo no)"

curl -s -H "Cookie: sw_brand=$B2" "http://localhost:$PORT/" > /tmp/radar_b2.html
# scoped view: card count == brand2's brief count from the API, fewer than all-brands view,
# and no brand-tag spans (tags only render in the all-brands view)
NB2API=$(curl -s "http://localhost:$PORT/api/briefs" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.briefs.filter(b=>b.brand_id==='$B2'&&b.status!=='dismissed').length)})")
NB2PAGE=$(grep -o 'brief-card' /tmp/radar_b2.html | wc -l)
NALL=$(grep -o 'brief-card' /tmp/radar_all.html | wc -l)
NTAG2=$(grep -o 'brand-tag' /tmp/radar_b2.html | wc -l)
check "scoped radar card count matches brand's briefs" "$NB2API" "$NB2PAGE"
check "scoped view smaller than all-brands view" "yes" "$([ "$NB2PAGE" -lt "$NALL" ] && echo yes || echo no)"
check "scoped view hides brand tags" 0 "$NTAG2"

B2BRIEF=$(curl -s "http://localhost:$PORT/api/briefs" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.briefs.find(b=>b.brand_id==='$B2'&&b.status==='new').id)})")
curl -s -o /tmp/gen2.json -X POST "http://localhost:$PORT/api/scripts" -H "Content-Type: application/json" -d "{\"briefId\":\"$B2BRIEF\"}" > /dev/null
CID2=$(node -e "const j=require('/tmp/gen2.json');console.log(j.contentId)")
curl -s -o /tmp/rep2.json -X POST "http://localhost:$PORT/api/repurpose" -H "Content-Type: application/json" -d "{\"scriptId\":\"$CID2\",\"kinds\":[\"x_thread\"]}" > /dev/null
P2=$(node -e "const j=require('/tmp/rep2.json');console.log(j.results[0].contentId)")
curl -s -o /dev/null -X PATCH "http://localhost:$PORT/api/content" -H "Content-Type: application/json" -d "{\"contentId\":\"$P2\",\"action\":\"approve\"}"
curl -s -o /dev/null -X PATCH "http://localhost:$PORT/api/content" -H "Content-Type: application/json" -d "{\"contentId\":\"$P2\",\"action\":\"schedule\"}"
NQ2=$(curl -s -H "Cookie: sw_brand=$B2" "http://localhost:$PORT/queue" | grep -o 'class="queue-row"' | wc -l)
NQ1=$(curl -s -H "Cookie: sw_brand=$BRAND" "http://localhost:$PORT/queue" | grep -o 'class="queue-row"' | wc -l)
NQALL=$(curl -s "http://localhost:$PORT/queue" | grep -o 'class="queue-row"' | wc -l)
check "queue scoped to brand 2 has exactly its 1 item" 1 "$NQ2"
check "queue scoped to brand 1 has exactly its 1 item" 1 "$NQ1"
check "all-brands queue = sum of both" 2 "$NQALL"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" -d "{\"brandId\":\"$B2\",\"brand\":{
    \"name\": \"Fretwork Guitar\",
    \"positioning\": \"We teach working adults to finish learning guitar with 15-minute daily practice systems.\",
    \"sources\": {\"subreddits\": [\"guitarlessons\"], \"ytKeywords\": [], \"keywords\": []},
    \"voice_profile\": {\"identity\": \"patient coach\", \"audience\": \"adult beginners\"},
    \"postiz_integrations\": {\"x\": \"int_guitar_x\", \"instagram\": \"int_guitar_ig\"}
  }}")
check "full brand update" 200 "$CODE"
IG=$(curl -s "http://localhost:$PORT/api/brands" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.brands.find(b=>b.id==='$B2').postiz_integrations.instagram)})")
check "integration mapping persisted" "int_guitar_ig" "$IG"

CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/brands")
check "GET /brands page" 200 "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" -d "{\"brandId\":\"$B2\",\"action\":\"archive\"}")
check "archive brand" 200 "$CODE"
NACT=$(curl -s "http://localhost:$PORT/api/brands" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).brands.length))")
check "archived brand excluded from active list" 1 "$NACT"


echo "== phase 3: analytics =="
CODE=$(curl -s -o /tmp/sync.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/sync" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/sync status" 200 "$CODE"
NSYNC=$(node -e "const j=require('/tmp/sync.json');console.log(j.synced)")
check "synced scheduled posts (>=2)" "yes" "$([ "$NSYNC" -ge 2 ] && echo yes || echo no)"
curl -s "http://localhost:$PORT/pulse" > /tmp/pulse.html
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/pulse")
check "GET /pulse status" 200 "$CODE"
NPR=$(grep -o 'class="pulse-row"' /tmp/pulse.html | wc -l)
check "pulse shows measured rows (>=2)" "yes" "$([ "$NPR" -ge 2 ] && echo yes || echo no)"
NPR1=$(curl -s -H "Cookie: sw_brand=$BRAND" "http://localhost:$PORT/pulse" | grep -o 'class="pulse-row"' | wc -l)
check "pulse scoped to brand 1 shows exactly 1" 1 "$NPR1"

echo "== phase 3: transcript ingestion =="
TRANSCRIPT="So today I want to talk about why most people quit learning guitar within three months. The number one reason is not talent, it is practice design. People sit down with no plan and noodle for an hour. The research on skill acquisition is really clear here. Short focused sessions beat long unfocused ones every single time. Fifteen minutes with a specific goal outperforms an hour of wandering. Second thing: song selection matters more than technique drills early on. If you pick songs you love that are slightly too hard, you stay motivated and your hands catch up. Third, recording yourself once a week changes everything. You hear progress you cannot feel day to day."
CODE=$(curl -s -o /tmp/ing.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/ingest" \
  -H "Content-Type: application/json" \
  -d "$(node -e "console.log(JSON.stringify({title:'Guitar quitting',transcript:process.argv[1]}))" "$TRANSCRIPT")")
check "POST /api/ingest status" 200 "$CODE"
ICID=$(node -e "const j=require('/tmp/ing.json');console.log(j.contentId)")
CODE=$(curl -s -o /tmp/ingpage.html -w "%{http_code}" "http://localhost:$PORT/scripts/$ICID")
check "ingested script page renders" 200 "$CODE"
IB=$(grep -o 'beat-head' /tmp/ingpage.html | wc -l)
check "ingested script has beats (>3 sections)" "yes" "$([ "$IB" -gt 3 ] && echo yes || echo no)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/ingest" \
  -H "Content-Type: application/json" -d '{"transcript":"too short"}')
check "short transcript -> 400" 400 "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/ingest")
check "GET /ingest page" 200 "$CODE"

echo "== phase 3: calibration =="
CODE=$(curl -s -o /tmp/cal.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/calibrate" \
  -H "Content-Type: application/json" -d "{\"brandId\":\"$BRAND\"}")
check "POST /api/calibrate status" 200 "$CODE"
NV=$(node -e "const j=require('/tmp/cal.json');console.log(j.variants.length)")
check "3 variants returned" 3 "$NV"
DISTINCT=$(node -e "const j=require('/tmp/cal.json');console.log(new Set(j.variants.map(v=>v.sample)).size)")
check "variant samples distinct" 3 "$DISTINCT"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:$PORT/api/brands" \
  -H "Content-Type: application/json" \
  -d "$(node -e "const j=require('/tmp/cal.json');console.log(JSON.stringify({brandId:process.argv[1],voice_profile:j.variants.find(v=>v.key==='B').profile}))" "$BRAND")")
check "apply picked variant" 200 "$CODE"
RHYTHM=$(curl -s "http://localhost:$PORT/api/brands" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.brands.find(b=>b.id==='$BRAND').voice_profile.sentence_rhythm.startsWith('Short. Punchy')?'yes':'no')})")
check "variant B rhythm persisted" "yes" "$RHYTHM"

echo "== phase 3: voiceover =="
CODE=$(curl -s -o /tmp/vo.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/voiceover" \
  -H "Content-Type: application/json" -d "{\"scriptId\":\"$CID\"}")
check "POST /api/voiceover status" 200 "$CODE"
NSEG=$(node -e "const j=require('/tmp/vo.json');console.log(j.segments)")
check "voiceover has segments (>=5)" "yes" "$([ "$NSEG" -ge 5 ] && echo yes || echo no)"
PROV=$(node -e "const j=require('/tmp/vo.json');console.log(j.provider)")
check "mock tts provider used" mock "$PROV"
curl -s "http://localhost:$PORT/scripts/$CID" > /tmp/script3.html
VOFILE=$(grep -o 'vo-[a-f0-9-]*\.wav' /tmp/script3.html | head -1)
CTYPE=$(curl -s -o /tmp/vo.wav -w "%{content_type}" "http://localhost:$PORT/api/assets/$VOFILE")
check "audio served as wav" "audio/wav" "$CTYPE"
WMAGIC=$(head -c 4 /tmp/vo.wav)
check "audio is real WAV" "RIFF" "$WMAGIC"
NVO=$(curl -s "http://localhost:$PORT/scripts/$CID" | grep -o 'class="vo-row"' | wc -l)
check "voiceover players render on script page (>=5)" "yes" "$([ "$NVO" -ge 5 ] && echo yes || echo no)"


echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
