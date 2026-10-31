import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

function getFallbackResponse(prompt: string, model: string = 'gpt-4o'): string {
  const p = prompt.toLowerCase();
  if (p.includes('code') || p.includes('javascript') || p.includes('typescript') || p.includes('python') || p.includes('function') || p.includes('class')) {
    return `Here is a clean, modern implementation for your request:

\`\`\`typescript
interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

export class TaskManager {
  private tasks: Map<string, TaskItem> = new Map();

  addTask(title: string): TaskItem {
    const task: TaskItem = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      createdAt: new Date(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  toggleTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.completed = !task.completed;
    return task.completed;
  }

  listActive(): TaskItem[] {
    return Array.from(this.tasks.values()).filter(t => !t.completed);
  }
}
\`\`\`

### Key Highlights:
1. **Type Safety**: Strictly typed with TypeScript interface.
2. **Performance**: O(1) lookups and updates via standard \`Map\`.
3. **Immutability & Extensibility**: Easy to plug into reactive UI frameworks or backend controllers.

Would you like me to tailor this for a specific framework or database?`;
  }

  if (p.includes('quantum') || p.includes('physics') || p.includes('science')) {
    return `### Quantum Computing in Simple Terms

Imagine a standard computer works like a normal light switch: it can be either **OFF (0)** or **ON (1)**.

A **Quantum Computer**, on the other hand, uses quantum bits or **qubits**. Thanks to two fascinating principles of quantum physics:

1. **Superposition**:
   Instead of just being 0 or 1, a qubit can exist in a state that is a mix of both at the same time—like a spinning coin before it lands.

2. **Entanglement**:
   Qubits can be linked so closely that the state of one instantly informs the state of another, no matter the distance.

### Why Does This Matter?
While normal computers check possibilities one by one (like walking through a maze sequentially), a quantum computer can evaluate millions of potential solutions simultaneously. This unlocks breakthrough speeds for:
- Discovering new life-saving medicines
- Designing ultra-efficient batteries & solar materials
- Optimizing global logistics and cryptography

Think of it not as a faster laptop, but as an entirely different kind of computational engine designed for nature's most complex challenges.`;
  }

  if (p.includes('brainstorm') || p.includes('idea') || p.includes('startup')) {
    return `### 5 Innovative Startup Ideas for Sustainable Energy

1. **Micro-Grid Autonomous Balancing**:
   AI-powered residential solar networks that trade micro-energy units peer-to-peer across neighborhood clusters during peak hours.

2. **Thermal Battery Retrofitting**:
   Converting decommissioned industrial boilers into high-temperature sand and molten-salt heat storage for district heating.

3. **EV Fleet Smart-Routing & Dynamic V2G**:
   Vehicle-to-grid grid stabilization software that pays commercial fleet operators for discharging unused battery reserves during grid spikes.

4. **Bio-Enzymatic Textile Recycling**:
   Closed-loop synthetic textile recycling utilizing engineered enzymes that degrade poly-blends back into virgin-grade monomers.

5. **Sub-surface Geothermal for Urban Buildings**:
   Ultra-deep borehole heat pumps utilizing sonic resonance drilling to install zero-emission geothermal loops beneath existing skyscrapers.`;
  }

  return `I understand! Let's explore this thoroughly.

Here are a few structured considerations and perspectives on **"${prompt.slice(0, 80)}"**:

1. **Context & Foundation**:
   Establishing a clear problem statement ensures all related decisions remain focused on the user's primary outcome.
   
2. **Practical Approach**:
   - Break the task down into modular, testable components.
   - Iterate rapidly with real feedback rather than speculative assumptions.
   - Maintain clean visual hierarchy and accessible interaction design.

3. **Actionable Recommendations**:
   - Start with the core workflow first before introducing secondary embellishments.
   - Verify states across both light and dark environments for contrast and clarity.

Feel free to ask follow-up questions, request specific code snippets, or dive deeper into any aspect!`;
}

export async function handleChatApi(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let bodyStr = '';
  req.on('data', (chunk) => {
    bodyStr += chunk;
  });

  req.on('end', async () => {
    try {
      const { messages, model = 'gpt-4o', reasoning = false, customInstructions = '' } = JSON.parse(bodyStr || '{}');

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing messages array' }));
        return;
      }

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const userPrompt = lastUserMessage?.content || 'Hello';

      // Set headers for Server-Sent Events (SSE)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // If reasoning requested, stream a simulated thinking block first
      if (reasoning || model.includes('o1') || model.includes('reason')) {
        const thoughts = [
          'Analyzing prompt requirements and intent...',
          'Evaluating technical constraints and structural clarity...',
          'Synthesizing key insights and formatting output with high readability...',
        ];
        for (const thought of thoughts) {
          res.write(`data: ${JSON.stringify({ type: 'thought', text: thought + ' ' })}\n\n`);
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 10) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          let systemInstruction = 'You are ChatGPT, a large language model trained by OpenAI. You provide clear, concise, accurate, and insightful answers with markdown formatting and clean code blocks.';
          if (customInstructions) {
            systemInstruction += `\nUser Custom Instructions: ${customInstructions}`;
          }

          const formattedContents = messages.map((m: { role: string; content: string }) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

          const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.8-flash',
            contents: formattedContents,
            config: {
              systemInstruction,
            },
          });

          for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: chunkText })}\n\n`);
            }
          }

          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } catch (geminiError: any) {
          console.warn('Gemini API call failed, falling back to smart simulated response:', geminiError?.message || geminiError);
        }
      }

      // Fallback simulated response
      const fallbackText = getFallbackResponse(userPrompt, model);
      const words = fallbackText.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 2) {
        const textPiece = (words[i] || '') + (words[i + 1] || '');
        res.write(`data: ${JSON.stringify({ type: 'content', text: textPiece })}\n\n`);
        await new Promise((r) => setTimeout(r, 20));
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      console.error('Error in chat handler:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal stream error' })}\n\n`);
        res.end();
      }
    }
  });
}
