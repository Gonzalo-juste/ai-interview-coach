import Anthropic from "@anthropic-ai/sdk";

export interface CompanyResearch {
  company_name: string;
  summary: string;
  culture: string;
  interview_style: string;
  recent_highlights: string;
  fetched_at: string;
}

async function tavilySearch(companyName: string): Promise<string> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: `${companyName} company culture values interview process work environment 2024 2025`,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const parts: string[] = [];
  if (data.answer) parts.push(data.answer);
  for (const result of (data.results ?? []).slice(0, 4)) {
    if (result.title && result.content) {
      parts.push(`${result.title}: ${result.content}`);
    }
  }

  return parts.join("\n\n");
}

export async function researchCompany(
  companyName: string
): Promise<CompanyResearch> {
  const rawContent = await tavilySearch(companyName);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    tools: [
      {
        name: "summarize_company",
        description:
          "Summarize company research into structured context for interview coaching",
        input_schema: {
          type: "object" as const,
          properties: {
            summary: {
              type: "string",
              description: "2-3 sentence factual overview of the company",
            },
            culture: {
              type: "string",
              description:
                "Key cultural values, work environment, and what the company expects from employees",
            },
            interview_style: {
              type: "string",
              description:
                "What the interview process and interviewer tone tends to be like — formal/casual, technical depth, behavioral focus, case-study emphasis, etc.",
            },
            recent_highlights: {
              type: "string",
              description:
                "Recent news, growth areas, products, or strategic priorities relevant to someone joining",
            },
          },
          required: ["summary", "culture", "interview_style", "recent_highlights"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "summarize_company" },
    messages: [
      {
        role: "user",
        content: `Summarize the following research about ${companyName} into structured context for mock interview coaching. Focus on what matters for a candidate preparing to interview there.\n\n${rawContent}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Company research summarization failed");
  }

  const extracted = toolUse.input as Omit<
    CompanyResearch,
    "company_name" | "fetched_at"
  >;

  return {
    company_name: companyName,
    ...extracted,
    fetched_at: new Date().toISOString(),
  };
}
