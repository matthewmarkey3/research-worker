const express = require('express');

const app = express();
app.use(express.json());

const LOVABLE_FUNCTIONS_URL = process.env.LOVABLE_FUNCTIONS_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

// ============================================================================
// PRISM INTELLIGENCE ENGINE - DUAL-PHASE DEEP RESEARCH
// ============================================================================

const PHASE_1_PROMPT = `You are an elite direct response market researcher trained in the methods of Gary Halbert, Eugene Schwartz, Dan Kennedy, and John Carlton. Conduct exhaustive research on [PRODUCT] in the [NICHE] market.

Find as many as possible for each category:

CORE RESEARCH:
- Pain points & fears (with verbatim customer quotes and sources)
- Desires & goals (with quotes)
- Hidden desires (things they want but are embarrassed to admit — status, vanity, revenge, proving others wrong, sexual desirability, feeling younger)
- Objections & hesitations (with quotes)
- Emotional drivers (the feelings that push them to act)
- Identity shifts (who they are now vs. who they want to become)
- Current beliefs about the problem
- The villain (who or what do they blame for their situation?)

BUYING BEHAVIOR:
- Trigger events that make them search NOW (life events, seasons, health scares, relationships, milestones)
- Failed solutions (what have they already tried that didn't work? Why did it fail?)
- Buying criteria (how do they evaluate options? What features matter?)
- Decision timeline (how long do they research before buying?)
- Price anchors (what have they paid for similar things? What feels "expensive" vs "cheap"?)
- Proof preferences (what evidence convinces them — testimonials, studies, before/afters, credentials, celebrity?)
- Risk perception (what's the worst case they imagine? What makes them hesitate at checkout?)
- Spouse/influencer objections (what would their partner, friends, doctor, or family say?)

LANGUAGE & VOICE:
- Exact language patterns (specific recurring words, phrases, slang they use)
- How they describe the problem in their own words
- How they describe success/the dream outcome in their own words
- Emotional vocabulary (the feeling words they use)
- Metaphors and analogies they use

MARKET INTELLIGENCE:
- Competitor mentions & specific complaints (what do they hate about existing solutions?)
- Success stories they admire (who has solved this that they look up to?)
- Where they research (Reddit, YouTube, Amazon reviews, Facebook groups, TikTok, forums, blogs)
- Influencers and authorities they trust
- Communities they belong to

CUSTOMER LIFECYCLE INSIGHTS:
- Competitor customers (why did they choose the competitor? What do they complain about with that choice?)
- Repeat buyer triggers (what makes someone buy again? What keeps them loyal?)
- Churn reasons (why do people stop using solutions like this? Why do they quit?)
- Referral language (how do happy customers describe this to friends and family?)
- Upsell desires (what else do they want after solving the initial problem?)
- Post-purchase regrets (buyer's remorse triggers, what makes them return products or cancel?)

STRATEGIC OUTPUT:
- Potential ad angles (hook concepts based on the research)
- Potential headlines (based on exact customer language)
- Potential proof elements (what claims can be supported with evidence found?)
- Potential offers (what would be irresistible based on their desires and fears?)
- Potential guarantees (what would eliminate their specific risk perception?)

For each item, include:
- The insight
- A verbatim quote if available
- Source URL

Organize findings by awareness level AND customer stage:

AWARENESS LEVELS (pre-purchase):
- Unaware (don't know they have a problem)
- Problem-aware (know the problem, not the solutions)
- Solution-aware (know solutions exist, comparing options)
- Product-aware (know this specific product, not yet convinced)
- Most-aware (ready to buy, need final push or right offer)

CUSTOMER STAGES (post-purchase):
- New customers (just bought, what do they need to succeed?)
- Active customers (using it, what would make them buy more?)
- At-risk customers (showing signs of leaving, why?)
- Lost customers (left, what drove them away?)
- Advocates (raving fans, how do they sell it for you?)

Be exhaustive. Real customer language over marketing speak. Verbatim quotes over summaries. Depth over breadth. Find the weird, specific, emotional stuff that writes the ads.`;


const PHASE_2_PROMPT = `For [PRODUCT] in the [NICHE] market, provide demographic and psychographic profiles mapped to each customer segment:

For EACH segment below, tell me WHO they are:

PRE-PURCHASE AWARENESS LEVELS:
1. Unaware - who doesn't realize this is their problem?
2. Problem-Aware - who knows they have the problem but doesn't know solutions exist?
3. Solution-Aware - who is actively comparing options?
4. Product-Aware - who knows about this product or similar products?
5. Most-Aware - who is ready to buy?

POST-PURCHASE STAGES:
6. New Customers
7. Repeat Customers
8. At-Risk (might leave)
9. Lost Customers
10. Advocates

FOR EACH SEGMENT, provide:
- Age range
- Income level
- Race/ethnicity breakdown (cite medical studies if available)
- Life stage (postpartum, perimenopausal, menopausal, post-hysterectomy, on BC, etc.)
- Geographic patterns
- Where they research online (specific subreddits, forums, sites)
- Health philosophy (natural vs. pharmaceutical)
- What influences their decisions (doctors, peers, influencers)
- Buying criteria ranked by importance
- Churn reasons (for post-purchase segments)
- Conversion tactics that work for this segment

Also include:
- Total addressable market size
- Percentage who actively seek solutions
- Market growth trends
- Key platforms for reaching each segment
- Decision influence hierarchy (what actually drives purchases)

Include sources for all data.`;


// Helper to get job from Lovable
async function getJob(jobId) {
  const response = await fetch(`${LOVABLE_FUNCTIONS_URL}/get-research-job-internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': WORKER_SECRET
    },
    body: JSON.stringify({ job_id: jobId })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get job: ${response.status}`);
  }
  
  const data = await response.json();
  return data.job;
}

// Helper to update job via Lovable
async function updateJob(jobId, updates) {
  const response = await fetch(`${LOVABLE_FUNCTIONS_URL}/update-research-job`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': WORKER_SECRET
    },
    body: JSON.stringify({ job_id: jobId, updates })
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to update job: ${response.status} - ${text}`);
  }
}

// Call Perplexity API
async function callPerplexity(prompt) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-deep-research',
      messages: [
        { role: 'user', content: prompt }
      ]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: data.citations || []
  };
}


app.post('/process-research', async (req, res) => {
  const { job_id } = req.body;
  
  console.log(`[${job_id}] 🔬 PRISM INTELLIGENCE ENGINE - Research request received`);
  
  // Return immediately - work happens async
  res.json({ received: true, job_id });
  
  try {
    // Fetch job details
    const job = await getJob(job_id);
    
    if (!job) {
      console.error(`[${job_id}] Job not found`);
      return;
    }

    console.log(`[${job_id}] Starting dual-phase research for: ${job.product_name}`);

    // Update to running
    await updateJob(job_id, {
      status: 'running',
      progress: 5,
      stage_message: 'Initializing Prism Intelligence Engine...',
      started_at: new Date().toISOString()
    });

    // ========================================================================
    // PHASE 1: Deep Emotional/Behavioral Research
    // ========================================================================
    
    await updateJob(job_id, {
      progress: 10,
      stage_message: 'Phase 1: Extracting emotional drivers, pain points, and language patterns...'
    });

    const phase1Prompt = PHASE_1_PROMPT
      .replace(/\[PRODUCT\]/g, job.product_name)
      .replace(/\[NICHE\]/g, job.niche || 'this market');

    if (job.product_description) {
      const enhancedPrompt = `${phase1Prompt}\n\nProduct description: ${job.product_description}`;
      var phase1PromptFinal = enhancedPrompt;
    } else {
      var phase1PromptFinal = phase1Prompt;
    }

    console.log(`[${job_id}] Phase 1: Calling Perplexity sonar-deep-research...`);
    const phase1Start = Date.now();

    const phase1Result = await callPerplexity(phase1PromptFinal);

    const phase1Elapsed = ((Date.now() - phase1Start) / 1000).toFixed(1);
    console.log(`[${job_id}] Phase 1 complete: ${phase1Result.citations.length} citations, ${phase1Result.content.length} chars in ${phase1Elapsed}s`);

    await updateJob(job_id, {
      progress: 45,
      stage_message: 'Phase 1 complete. Starting Phase 2: Demographic profiling...'
    });

    // ========================================================================
    // PHASE 2: Demographic & Psychographic Profiling
    // ========================================================================

    await updateJob(job_id, {
      progress: 50,
      stage_message: 'Phase 2: Mapping demographics and psychographics to each segment...'
    });

    const phase2Prompt = PHASE_2_PROMPT
      .replace(/\[PRODUCT\]/g, job.product_name)
      .replace(/\[NICHE\]/g, job.niche || 'this market');

    if (job.product_description) {
      const enhancedPrompt2 = `${phase2Prompt}\n\nProduct description: ${job.product_description}`;
      var phase2PromptFinal = enhancedPrompt2;
    } else {
      var phase2PromptFinal = phase2Prompt;
    }

    console.log(`[${job_id}] Phase 2: Calling Perplexity sonar-deep-research...`);
    const phase2Start = Date.now();

    const phase2Result = await callPerplexity(phase2PromptFinal);

    const phase2Elapsed = ((Date.now() - phase2Start) / 1000).toFixed(1);
    console.log(`[${job_id}] Phase 2 complete: ${phase2Result.citations.length} citations, ${phase2Result.content.length} chars in ${phase2Elapsed}s`);

    // ========================================================================
    // COMBINE RESULTS
    // ========================================================================

    await updateJob(job_id, {
      progress: 85,
      stage_message: 'Combining research phases and structuring insights...'
    });

    const totalCitations = [...new Set([...phase1Result.citations, ...phase2Result.citations])];
    
    const combinedResearch = `
# PRISM INTELLIGENCE ENGINE - COMPLETE MARKET RESEARCH

## Research Summary
- **Product:** ${job.product_name}
- **Niche:** ${job.niche || 'Not specified'}
- **Total Sources Analyzed:** ${totalCitations.length}
- **Phase 1 (Behavioral):** ${phase1Result.citations.length} sources
- **Phase 2 (Demographic):** ${phase2Result.citations.length} sources

---

# PHASE 1: EMOTIONAL & BEHAVIORAL RESEARCH

${phase1Result.content}

---

# PHASE 2: DEMOGRAPHIC & PSYCHOGRAPHIC PROFILES

${phase2Result.content}

---

## All Citations (${totalCitations.length} sources)

${totalCitations.map((url, i) => `${i + 1}. ${url}`).join('\n')}
`;

    console.log(`[${job_id}] Combined research: ${totalCitations.length} total unique citations, ${combinedResearch.length} chars`);

    // Update with combined research
    await updateJob(job_id, {
      progress: 95,
      stage_message: 'Finalizing research package...',
      raw_research: combinedResearch,
      citations: totalCitations,
    });

    // ========================================================================
    // PARSE INTO STRUCTURED FORMAT (Optional - using Lovable AI)
    // ========================================================================

    let parsedResearch = null;
    
    if (process.env.LOVABLE_API_KEY) {
      try {
        console.log(`[${job_id}] Parsing into structured format...`);
        
        const parsePrompt = `Parse the following market research into structured JSON. Extract and organize:
{
  "phase1_behavioral": {
    "pain_points": [{ "insight": "", "quote": "", "source": "", "awareness_level": "" }],
    "desires": [{ "insight": "", "quote": "", "source": "" }],
    "hidden_desires": [{ "insight": "", "quote": "", "source": "" }],
    "objections": [{ "insight": "", "quote": "", "source": "" }],
    "emotional_drivers": [{ "insight": "", "quote": "", "source": "" }],
    "identity_shifts": [{ "insight": "", "quote": "", "source": "" }],
    "beliefs": [{ "insight": "", "quote": "", "source": "" }],
    "villains": [{ "insight": "", "quote": "", "source": "" }],
    "trigger_events": [{ "insight": "", "quote": "", "source": "" }],
    "failed_solutions": [{ "insight": "", "quote": "", "source": "" }],
    "buying_criteria": [{ "insight": "", "quote": "", "source": "" }],
    "language_patterns": [{ "phrase": "", "context": "", "source": "" }],
    "competitor_insights": [{ "insight": "", "quote": "", "source": "" }],
    "ad_angles": [{ "angle": "", "target_awareness": "", "hook_style": "" }],
    "headlines": [{ "headline": "", "target_segment": "" }],
    "offers": [{ "offer": "", "target_segment": "" }],
    "guarantees": [{ "guarantee": "", "addresses_fear": "" }]
  },
  "phase2_demographic": {
    "segments": {
      "unaware": { "age_range": "", "income": "", "life_stage": "", "where_they_research": [], "health_philosophy": "" },
      "problem_aware": { "age_range": "", "income": "", "life_stage": "", "where_they_research": [], "health_philosophy": "" },
      "solution_aware": { "age_range": "", "income": "", "life_stage": "", "where_they_research": [], "buying_criteria": [] },
      "product_aware": { "age_range": "", "income": "", "life_stage": "", "where_they_research": [], "decision_factors": [] },
      "most_aware": { "age_range": "", "income": "", "life_stage": "", "conversion_accelerators": [] },
      "new_customers": { "churn_risk": "", "critical_touchpoints": [], "expectations": "" },
      "repeat_customers": { "purchase_pattern": "", "retention_drivers": [], "ltv": "" },
      "at_risk": { "red_flags": [], "churn_reasons": [], "win_back_strategies": [] },
      "lost_customers": { "why_they_left": [], "reactivation_potential": "" },
      "advocates": { "behaviors": [], "where_active": [], "amplification_opportunities": [] }
    },
    "market_size": { "tam": "", "active_seekers_percent": "", "growth_rate": "" },
    "decision_hierarchy": [],
    "key_platforms": []
  },
  "total_citations": 0
}

Research to parse:
${combinedResearch}

Return ONLY valid JSON, no other text.`;

        const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'user', content: parsePrompt }
            ],
          }),
        });

        if (parseResponse.ok) {
          const parseData = await parseResponse.json();
          const content = parseData.choices?.[0]?.message?.content || '';
          
          const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                            content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResearch = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            parsedResearch.total_citations = totalCitations.length;
            console.log(`[${job_id}] Parsed research successfully`);
          }
        }
      } catch (parseError) {
        console.error(`[${job_id}] Parse failed (non-fatal):`, parseError.message);
      }
    }

    // ========================================================================
    // MARK COMPLETE
    // ========================================================================

    await updateJob(job_id, {
      status: 'completed',
      progress: 100,
      stage_message: `Prism Intelligence complete! ${totalCitations.length} sources analyzed.`,
      parsed_research: parsedResearch,
      completed_at: new Date().toISOString()
    });

    const totalElapsed = ((Date.now() - new Date(job.created_at).getTime()) / 1000).toFixed(1);
    console.log(`[${job_id}] ✅ PRISM INTELLIGENCE COMPLETE - ${totalCitations.length} citations, ${combinedResearch.length} chars in ${totalElapsed}s total`);

  } catch (error) {
    console.error(`[${job_id}] ❌ Research failed:`, error.message);
    
    await updateJob(job_id, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    engine: 'Prism Intelligence Engine',
    version: '2.0.0',
    timestamp: new Date().toISOString() 
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'Prism Intelligence Engine',
    description: 'Dual-phase deep market research powered by sonar-deep-research',
    version: '2.0.0',
    endpoints: ['/process-research', '/health']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔬 Prism Intelligence Engine running on port ${PORT}`);
});
