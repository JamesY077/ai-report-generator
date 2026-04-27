import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  convertInchesToTwip,
  Footer,
  PageNumber,
} from 'docx';
import { saveAs } from 'file-saver';
import type { OutlineNode, Version } from '../types';

const FONT_SONG = { eastAsia: '宋体', ascii: 'Times New Roman', hAnsi: 'Times New Roman' };
const FONT_HEI = { eastAsia: '黑体', ascii: 'Arial', hAnsi: 'Arial' };
const BODY_SIZE = 24; // 小四，12pt
const BODY_LINE = 360; // 1.5 倍行距
const FIRST_LINE_INDENT = 480; // 约两个中文字符

function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = [];
  function traverse(list: OutlineNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) traverse(node.children);
    }
  }
  traverse(nodes);
  return result;
}

function getHeadingLevel(level: number): typeof HeadingLevel[keyof typeof HeadingLevel] {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    default: return HeadingLevel.HEADING_4;
  }
}

function cleanMarkdownText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/g, '')
    .replace(/^[-*•]\s+/g, '')
    .replace(/^\d+\.\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|/g, ' ')
    .trim();
}

function contentToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({
        text: '',
        spacing: { line: BODY_LINE, before: 0, after: 0 },
      }));
      continue;
    }

    const plainText = cleanMarkdownText(trimmed);
    if (!plainText) continue;

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: plainText, font: FONT_SONG, size: BODY_SIZE })],
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: FIRST_LINE_INDENT },
        spacing: { line: BODY_LINE, before: 0, after: 120 },
      })
    );
  }

  return paragraphs;
}

function createHeadingParagraph(node: OutlineNode): Paragraph {
  const levelStyles: Record<number, { size: number; before: number; after: number }> = {
    1: { size: 32, before: 480, after: 240 },
    2: { size: 30, before: 360, after: 200 },
    3: { size: 28, before: 280, after: 160 },
  };
  const style = levelStyles[node.level] ?? levelStyles[3];

  return new Paragraph({
    children: [new TextRun({
      text: node.title,
      bold: true,
      font: FONT_HEI,
      size: style.size,
    })],
    heading: getHeadingLevel(node.level),
    alignment: node.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: style.before, after: style.after, line: BODY_LINE },
    pageBreakBefore: node.level === 1,
  });
}

function createFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '第 ', font: FONT_SONG, size: 20 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT_SONG, size: 20 }),
          new TextRun({ text: ' 页', font: FONT_SONG, size: 20 }),
        ],
      }),
    ],
  });
}

export async function exportToDocx(
  theme: string,
  outline: OutlineNode[],
  version: Version,
  versionNum: number
): Promise<void> {
  const flatList = flattenOutline(outline);
  const children: Paragraph[] = [];

  // 封面标题
  children.push(
    new Paragraph({
      children: [new TextRun({
        text: theme,
        bold: true,
        font: FONT_HEI,
        size: 44,
      })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2200, after: 480, line: BODY_LINE },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `版本 ${versionNum}  |  字数：${version.wordCount.toLocaleString()} 字`,
          color: '888888',
          font: FONT_SONG,
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 2200, line: BODY_LINE },
    })
  );

  // 分页
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 目录标题
  children.push(
    new Paragraph({
      children: [new TextRun({
        text: '目  录',
        bold: true,
        font: FONT_HEI,
        size: 32,
      })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400, line: BODY_LINE },
    })
  );

  // 目录列表
  for (const node of flatList) {
    const indentTwip = (node.level - 1) * convertInchesToTwip(0.3);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: node.title,
            bold: node.level === 1,
            font: node.level === 1 ? FONT_HEI : FONT_SONG,
            size: node.level === 1 ? 24 : 22,
          }),
        ],
        indent: { left: indentTwip },
        spacing: { before: 80, after: 80, line: 320 },
      })
    );
  }

  // 分页进入正文
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 正文内容
  for (const node of flatList) {
    children.push(createHeadingParagraph(node));

    const content = version.content[node.id] || '';
    if (content) {
      const contentParas = contentToParagraphs(content);
      children.push(...contentParas);
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
              header: convertInchesToTwip(0.5),
              footer: convertInchesToTwip(0.5),
              gutter: 0,
            },
          },
        },
        footers: {
          default: createFooter(),
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: FONT_SONG,
            size: BODY_SIZE,
          },
          paragraph: {
            spacing: { line: BODY_LINE },
          },
        },
        title: {
          run: {
            font: FONT_HEI,
            size: 44,
            bold: true,
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { line: BODY_LINE },
          },
        },
        heading1: {
          run: {
            font: FONT_HEI,
            size: 32,
            bold: true,
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240, line: BODY_LINE },
          },
        },
        heading2: {
          run: {
            font: FONT_HEI,
            size: 30,
            bold: true,
          },
          paragraph: {
            spacing: { before: 360, after: 200, line: BODY_LINE },
          },
        },
        heading3: {
          run: {
            font: FONT_HEI,
            size: 28,
            bold: true,
          },
          paragraph: {
            spacing: { before: 280, after: 160, line: BODY_LINE },
          },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${theme}_v${versionNum}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.docx`;
  saveAs(blob, filename);
}
