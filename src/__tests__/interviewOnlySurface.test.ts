import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

declare const process: {
  cwd: () => string;
};

const root = process.cwd();

test('keeps the app source focused on the standalone interview workflow', () => {
  const removedLegacyFiles = [
    'src/components/ChartPanel.tsx',
    'src/components/CritiqueStep.tsx',
    'src/components/DataTable.tsx',
    'src/components/HypothesisStep.tsx',
    'src/components/PredictionStep.tsx',
    'src/components/ReportStep.tsx',
    'src/components/ResearchQuestionStep.tsx',
    'src/components/SampleDesignStep.tsx',
    'src/components/SurveyDesignStep.tsx',
    'src/components/SurveyStep.tsx',
    'src/components/TopicStep.tsx',
    'src/lib/reportBuilder.ts',
    'src/lib/researchWorkflow.ts',
    'src/lib/surveyEngine.ts',
  ];

  expect(removedLegacyFiles.filter((file) => existsSync(join(root, file)))).toEqual([]);
});
