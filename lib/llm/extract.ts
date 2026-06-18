import Anthropic from "@anthropic-ai/sdk";

export interface JdCvExtraction {
  role_title: string;
  seniority: string;
  key_skills: string[];
  claimed_achievements: string[];
  years_experience: string;
  industry: string;
}

export async function extractJdCv(
  jdText: string,
  cvText: string
): Promise<JdCvExtraction> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    tools: [
      {
        name: "extract_job_and_cv",
        description:
          "Extract structured information from a job description and CV for interview coaching",
        input_schema: {
          type: "object" as const,
          properties: {
            role_title: {
              type: "string",
              description: "The job title/role being applied for",
            },
            seniority: {
              type: "string",
              description:
                "Seniority level (junior / mid / senior / staff / principal / lead / manager / director / etc.)",
            },
            key_skills: {
              type: "array",
              items: { type: "string" },
              description:
                "Up to 10 key technical and soft skills required by the job description",
            },
            claimed_achievements: {
              type: "array",
              items: { type: "string" },
              description:
                "Up to 8 notable achievements, projects, or experiences claimed in the CV — each as a single concrete sentence",
            },
            years_experience: {
              type: "string",
              description:
                "Required or apparent years of relevant experience (e.g. '5+ years', '3 years')",
            },
            industry: {
              type: "string",
              description:
                "Industry or domain (e.g. fintech, healthcare, e-commerce, SaaS, consulting)",
            },
          },
          required: [
            "role_title",
            "seniority",
            "key_skills",
            "claimed_achievements",
            "years_experience",
            "industry",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_job_and_cv" },
    messages: [
      {
        role: "user",
        content: `Extract structured information from this job description and CV for use in interview coaching.\n\n<job_description>\n${jdText}\n</job_description>\n\n<cv>\n${cvText}\n</cv>`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("JD/CV extraction failed: no tool use in response");
  }

  return toolUse.input as JdCvExtraction;
}
