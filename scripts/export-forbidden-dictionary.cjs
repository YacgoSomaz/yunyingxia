const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const dictionaryPath = path.join(
  projectRoot,
  'vendor',
  'qianshan-runtime',
  'dist',
  'services',
  'content-audit',
  'dictionary.js',
);
const outputArgument = process.argv[2];
const outputDirectory = outputArgument
  ? path.resolve(outputArgument)
  : path.join(os.homedir(), 'Desktop', '运营虾违禁词库');

const { BUILTIN_FORBIDDEN_WORDS, flattenWords } = require(dictionaryPath);
const entries = flattenWords();
const generatedAt = new Date().toISOString();

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

fs.mkdirSync(outputDirectory, { recursive: true });

const jsonExport = {
  format: 'yunyingxia.forbidden-words.v1',
  source: '运营虾内置内容审核词库',
  generated_at: generatedAt,
  notes: [
    '仅包含内置合规词库，不包含用户自定义词、账号数据或其他本机数据。',
    '词条按包含匹配设计；请结合目标平台规则和业务语境使用。',
    '该词库不覆盖政治、色情等高风险类别，请由目标产品自行配置。',
  ],
  categories: BUILTIN_FORBIDDEN_WORDS,
  entries,
};
fs.writeFileSync(
  path.join(outputDirectory, '运营虾内置违禁词库.json'),
  `${JSON.stringify(jsonExport, null, 2)}\n`,
  'utf8',
);

const csvHeader = ['word', 'category', 'severity', 'label', 'suggestion'];
const csvRows = entries.map((entry) => [
  entry.word,
  entry.category,
  entry.severity,
  entry.label,
  entry.suggestion,
]);
fs.writeFileSync(
  path.join(outputDirectory, '运营虾内置违禁词库.csv'),
  `\uFEFF${[csvHeader, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
  'utf8',
);

fs.writeFileSync(
  path.join(outputDirectory, '运营虾内置违禁词_一行一个词.txt'),
  `\uFEFF${entries.map((entry) => entry.word).join('\r\n')}\r\n`,
  'utf8',
);

const summary = [
  '# 运营虾内置违禁词库',
  '',
  `导出时间：${generatedAt}`,
  `分类数：${BUILTIN_FORBIDDEN_WORDS.length}`,
  `词条数：${entries.length}`,
  '',
  '文件说明：',
  '- `运营虾内置违禁词库.json`：完整分类、严重度和改写建议，适合程序直接导入。',
  '- `运营虾内置违禁词库.csv`：适合 Excel、数据库导入。',
  '- `运营虾内置违禁词_一行一个词.txt`：适合仅需要词条列表的产品。',
  '',
  '注意：这是内容审核辅助词库，不能替代目标平台的实时规则、人工审核或法律意见。',
].join('\r\n');
fs.writeFileSync(path.join(outputDirectory, 'README.md'), `\uFEFF${summary}\r\n`, 'utf8');

console.log(`Exported ${entries.length} entries across ${BUILTIN_FORBIDDEN_WORDS.length} categories.`);
console.log(outputDirectory);
