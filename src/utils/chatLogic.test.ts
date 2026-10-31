import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTitleFromPrompt,
  groupConversationsByDate,
  filterConversations,
  parseMarkdownBlocks,
  estimateTokens,
  cleanTextForSpeech,
  formatTokenLimitProgress,
  type Conversation,
} from './chatLogic';

test('generateTitleFromPrompt formats short titles cleanly', () => {
  assert.equal(generateTitleFromPrompt('Hello world! How are you today?'), 'Hello world');
  assert.equal(generateTitleFromPrompt('Explain quantum computing simply'), 'Explain quantum computing simply');
  assert.equal(generateTitleFromPrompt(''), 'New chat');
});

test('groupConversationsByDate groups items into relative intervals', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime();
  const convs: Conversation[] = [
    {
      id: '1',
      title: 'Today chat',
      messages: [],
      createdAt: now - 1000 * 60,
      updatedAt: now - 1000 * 60,
    },
    {
      id: '2',
      title: 'Yesterday chat',
      messages: [],
      createdAt: now - 1000 * 60 * 60 * 20,
      updatedAt: now - 1000 * 60 * 60 * 20,
    },
    {
      id: '3',
      title: 'Week chat',
      messages: [],
      createdAt: now - 1000 * 60 * 60 * 24 * 3,
      updatedAt: now - 1000 * 60 * 60 * 24 * 3,
    },
  ];

  const grouped = groupConversationsByDate(convs, now);
  assert.ok(grouped['Today']);
  assert.equal(grouped['Today'].length, 1);
  assert.equal(grouped['Today'][0].title, 'Today chat');
});

test('filterConversations finds conversations matching query', () => {
  const convs: Conversation[] = [
    {
      id: '1',
      title: 'React component design',
      messages: [{ id: 'm1', role: 'user', content: 'How to build buttons?', timestamp: 100 }],
      createdAt: 100,
      updatedAt: 100,
    },
    {
      id: '2',
      title: 'Recipe for pancakes',
      messages: [{ id: 'm2', role: 'user', content: 'Flour, milk, eggs', timestamp: 200 }],
      createdAt: 200,
      updatedAt: 200,
    },
  ];

  assert.equal(filterConversations(convs, 'react').length, 1);
  assert.equal(filterConversations(convs, 'pancakes').length, 1);
  assert.equal(filterConversations(convs, 'buttons').length, 1);
  assert.equal(filterConversations(convs, 'nonexistent').length, 0);
});

test('parseMarkdownBlocks extracts code blocks and headings correctly', () => {
  const md = `# Title
Here is some text.
\`\`\`typescript
const a = 1;
\`\`\`
More text afterwards.`;

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].content, 'Title');
  assert.equal(blocks[1].type, 'text');
  assert.equal(blocks[2].type, 'code');
  assert.equal(blocks[2].lang, 'typescript');
  assert.equal(blocks[2].content, 'const a = 1;');
  assert.equal(blocks[3].type, 'text');
});

test('estimateTokens calculates estimated token count', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('Hello world this is a test'), 7);
  assert.equal(estimateTokens(''), 0);
});

test('cleanTextForSpeech cleans markdown for natural speech playback', () => {
  const md = `### Hello World
This is **bold** and *italic* and \`inline code\`.
- Point one
- Point two
\`\`\`python
print("hello")
\`\`\`
Check [OpenAI](https://openai.com) now!`;

  const speechText = cleanTextForSpeech(md);
  assert.ok(!speechText.includes('###'));
  assert.ok(!speechText.includes('**'));
  assert.ok(!speechText.includes('```'));
  assert.ok(speechText.includes('bold and italic and inline code'));
  assert.ok(speechText.includes('Here is a code example in python'));
  assert.ok(speechText.includes('Check OpenAI now!'));
});

test('formatTokenLimitProgress accurately calculates limits, percentage, and warnings', () => {
  const normal = formatTokenLimitProgress(100, 4000);
  assert.equal(normal.count, 100);
  assert.equal(normal.max, 4000);
  assert.equal(normal.estimatedTokens, 25);
  assert.equal(normal.percentage, 3); // 2.5% rounded
  assert.equal(normal.isWarning, false);
  assert.equal(normal.isOverLimit, false);

  const warning = formatTokenLimitProgress(3500, 4000);
  assert.equal(warning.isWarning, true);
  assert.equal(warning.isOverLimit, false);

  const over = formatTokenLimitProgress(4050, 4000);
  assert.equal(over.isOverLimit, true);
  assert.equal(over.percentage, 100);
});


