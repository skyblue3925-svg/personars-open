export type PersonaSeed = {
  id: string;
  label: string;
  ageGroup: string;
  region: string;
  occupation: string;
  background: string;
  perspective: string;
  voice: string;
  livedExperiences: string[];
  concerns: string[];
  tensions: string[];
  source?: PersonaSeedSource;
};

export type PersonaSeedSource = {
  kind: 'fallback' | 'nemotron';
  sourceUuid?: string;
  personaType?: string;
  sex?: string;
  age?: number;
  province?: string;
  district?: string;
  occupation?: string;
  educationLevel?: string;
  familyType?: string;
  housingType?: string;
  maritalStatus?: string;
  isCompleteIndex?: boolean;
  sourceRecordCount?: number;
  expandedPersonaCount?: number;
};

export type TopicCategory =
  | 'smartphone-sleep'
  | 'school-meal'
  | 'youth-work'
  | 'climate-anxiety'
  | 'regional-access'
  | 'education-support'
  | 'digital-access'
  | 'media-body-image'
  | 'general';

export type TopicRelevance = 'direct' | 'adjacent' | 'limited';

export type ConcreteScene = {
  id: string;
  setting: string;
  people: string[];
  action: string;
  pressure: string;
  feeling: string;
  consequence: string;
  quoteSeed: string;
};

export type TopicFrame = {
  category: TopicCategory;
  topic: string;
  affectedGroups: string[];
  places: string[];
  pressures: string[];
  tensionAxes: string[];
  boundaries: string[];
  sceneSeed: Omit<ConcreteScene, 'id' | 'people'>;
};

export type InterviewCharacter = {
  persona: PersonaSeed;
  topicCategory: TopicCategory;
  topicFrame: TopicFrame;
  relevance: TopicRelevance;
  lifeContext: string;
  canSpeakTo: string[];
  cannotSpeakTo: string[];
  concreteScenes: ConcreteScene[];
  recurringTensions: string[];
  usedSceneIds: string[];
};

export type ResearchDraft = {
  topic: string;
  title: string;
  question: string;
  hypothesis: string;
  targetGroup: string;
  independentVariable?: string;
  dependentVariable?: string;
};

export type SampleGroupRatio = {
  label: string;
  ratio: number;
  description: string;
};

export type PopulationPlan = {
  id: string;
  label: string;
  description: string;
  coverageNote: string;
};

export type SamplePlan = {
  id: string;
  label: string;
  size: number;
  population?: PopulationPlan;
  groups: SampleGroupRatio[];
  biasNote: string;
};

export type InterviewQuestion = {
  id: string;
  text: string;
  intent: string;
};

export type InterviewEvidenceKind = 'personaProfile' | 'lifeScene' | 'speakableScope' | 'uncertainBoundary';

export type InterviewEvidence = {
  kind: InterviewEvidenceKind;
  label: string;
  text: string;
};

export type InterviewTurn = {
  question: string;
  answer: string;
  source?: 'llm' | 'template';
  modelId?: string;
  generatedAt?: string;
  evidence?: InterviewEvidence[];
  coach?: InterviewCoachFeedback;
};

export type InterviewCoachFeedback = {
  score: number;
  tags: string[];
  summary: string;
  suggestion: string;
  revisedQuestion: string;
  coverage: {
    lifeScene: boolean;
    emotionTension: boolean;
    relationship: boolean;
    conditionConstraint: boolean;
    unknownBoundary: boolean;
  };
  source: 'llm';
  modelId?: string;
  generatedAt?: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type InterviewResult = {
  persona: PersonaSeed;
  character?: InterviewCharacter;
  groupReason: string;
  turns: InterviewTurn[];
  quotes: string[];
  codes: string[];
  themes: string[];
};

export type ResearchProject = {
  draft: ResearchDraft;
  aiInterviewEnabled?: boolean;
  samplePlan: SamplePlan;
  interviewQuestions: InterviewQuestion[];
  interviews: InterviewResult[];
  selectedPersonaIds?: string[];
};
