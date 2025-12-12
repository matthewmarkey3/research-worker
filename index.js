const express = require('express');

const app = express();
app.use(express.json());

const LOVABLE_FUNCTIONS_URL = process.env.LOVABLE_FUNCTIONS_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

const RESEARCH_PROMPT = `You are a direct response market researcher. Conduct deep research on this product and market.

Find as many as possible for each category:

- Pain points & fears (with verbatim customer quotes and sources)
- Desires & goals (with quotes)
- Objections & hesitations (with quotes)
- Emotional drivers
- Identity shifts (who they want to become)
- Current beliefs about the problem
- Trigger events that make them search for solutions
- Buying criteria they use to evaluate options
- Relationships & influences (who they trust, communities they're part of, authorities they follow)
- Competitor mentions & complaints
- Demographics (age, gender, income, location, life stage)
- Psychographics (values, lifestyle, personality traits)
- Potential ad angles

For each item, include:
- The insight
- A verbatim quote if available
- Source URL

Organize findings by awareness level where applicable:
- Unaware (don't know they have a problem)
- Problem-aware (know the problem, not the solutions)
- Solution-aware (know solutions exist, comparing options)
- Product-aware (know this product, not convinced)
- Most-aware (ready to buy, need final push)

Be thorough. Quality over arbitrary counts.`;

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

app.post('/process-research', async (req, res) => {
  const { job_id } = req.body;
  
  console.log(`[${job_id}] Received research request`);
  
  // Return immediately - work happens async
  res.json({ received: true, job_id });
  
  try {
    // Fetch job details via Lovable edge function
    const job = await getJob(job_id);
    
    if (!job) {
      console.error(`[${job_id}] Job not found`);
      return;
    }

    console.log(`[${job_id}] Starting research for: ${job.product_name}`);

    // Update to running
    await updateJob(job_id, {
      status: 'running',
      progress: 10,
      progress_message: 'Starting deep research...',
      started_at: new Date().toISOString()
    });

    // Build the full prompt
    const fullPrompt = `${RESEARCH_PROMPT}

Product: ${job.product_name}
Description: ${job.product_description || 'Not provided'}
Niche: ${job.niche || 'Not specified'}`;

    // Update progress
    await updateJob(job_id, {
      progress: 25,
      progress_message: 'Searching Reddit, forums, reviews, communities...'
    });

    console.log(`[${job_id}] Calling Perplexity sonar-deep-research...`);
    const startTime = Date.now();

    // Call Perplexity - NO TIMEOUT LIMITS
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [
          { role: 'user', content: fullPrompt }
        ]
      }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${job_id}] Perplexity responded in ${elapsed}s`);

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      throw new Error(`Perplexity error ${perplexityResponse.status}: ${errorText}`);
    }

    const perplexityData = await perplexityResponse.json();
    const rawResearch = perplexityData.choices?.[0]?.message?.content || '';
    const citations = perplexityData.citations || [];

    console.log(`[${job_id}] Got ${citations.length} citations, ${rawResearch.length} chars`);

    // Update with raw research
    await updateJob(job_id, {
      progress: 70,
      progress_message: 'Research complete. Processing results...',
      raw_research: rawResearch,
      citations: citations,
    });

    // Try to parse with Lovable AI (optional)
    let parsedResearch = null;
    
    if (process.env.LOVABLE_API_KEY) {
      try {
        console.log(`[${job_id}] Parsing with Lovable AI...`);
        
        const parsePrompt = `Parse the following market research into structured JSON. Extract:
{
  "pain_points": [{ "insight": "", "quote": "", "source": "", "awareness_level": "" }],
  "desires": [{ "insight": "", "quote": "", "source": "" }],
  "objections": [{ "insight": "", "quote": "", "source": "" }],
  "emotional_drivers": [{ "insight": "", "quote": "", "source": "" }],
  "identity_shifts": [{ "insight": "", "quote": "", "source": "" }],
  "beliefs": [{ "insight": "", "quote": "", "source": "" }],
  "trigger_events": [{ "insight": "", "quote": "", "source": "" }],
  "buying_criteria": [{ "insight": "", "quote": "", "source": "" }],
  "influences": [{ "insight": "", "quote": "", "source": "" }],
  "competitor_insights": [{ "insight": "", "quote": "", "source": "" }],
  "demographics": { "age": "", "gender": "", "income": "", "location": "", "life_stage": "" },
  "psychographics": { "values": [], "lifestyle": [], "personality": [] },
  "ad_angles": [{ "angle": "", "target_awareness": "", "hook_style": "" }]
}

Research to parse:
${rawResearch}

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
          
          // Extract JSON from response
          const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                            content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResearch = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            console.log(`[${job_id}] Parsed research successfully`);
          }
        }
      } catch (parseError) {
        console.error(`[${job_id}] Parse failed (non-fatal):`, parseError.message);
      }
    }

    // Mark complete
    await updateJob(job_id, {
      status: 'completed',
      progress: 100,
      progress_message: 'Research complete!',
      parsed_research: parsedResearch,
      completed_at: new Date().toISOString()
    });

    console.log(`[${job_id}] ✅ Job completed successfully`);

  } catch (error) {
    console.error(`[${job_id}] ❌ Job failed:`, error.message);
    
    await updateJob(job_id, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'ConversionLab Research Worker',
    status: 'running',
    endpoints: ['/process-research', '/health']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Research worker running on port ${PORT}`);
});
