import type { PersonaSeed } from '../types/research';

export const NEMOTRON_PERSONA_TYPES = [
  'professional_persona',
  'sports_persona',
  'arts_persona',
  'travel_persona',
  'culinary_persona',
  'family_persona',
  'persona',
] as const;

export type NemotronPersonaType = (typeof NEMOTRON_PERSONA_TYPES)[number];

export type NemotronPersonaRecord = {
  uuid: string;
  professional_persona: string;
  sports_persona: string;
  arts_persona: string;
  travel_persona: string;
  culinary_persona: string;
  family_persona: string;
  persona: string;
  cultural_background?: string;
  skills_and_expertise?: string;
  skills_and_expertise_list?: string;
  hobbies_and_interests?: string;
  hobbies_and_interests_list?: string;
  career_goals_and_ambitions?: string;
  sex?: string;
  age: number;
  marital_status?: string;
  military_status?: string;
  family_type?: string;
  housing_type?: string;
  education_level?: string;
  bachelors_field?: string;
  occupation?: string;
  district?: string;
  province?: string;
  country?: string;
};

export type NemotronPersonaEntry = {
  sourceUuid: string;
  personaType: NemotronPersonaType;
  personaText: string;
  record: NemotronPersonaRecord;
};

export type NemotronIndexMetadata = {
  source: 'nemotron';
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  generatedAt: string;
  label: string;
};

export function expandNemotronRecord(record: NemotronPersonaRecord): NemotronPersonaEntry[] {
  return NEMOTRON_PERSONA_TYPES.map((personaType) => ({
    sourceUuid: record.uuid,
    personaType,
    personaText: record[personaType],
    record,
  }));
}

export function buildNemotronIndexMetadata({
  sourceRecordCount,
  expandedPersonaCount,
  isComplete,
  generatedAt = new Date().toISOString(),
}: {
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  generatedAt?: string;
}): NemotronIndexMetadata {
  return {
    source: 'nemotron',
    sourceRecordCount,
    expandedPersonaCount,
    isComplete,
    generatedAt,
    label: isComplete ? 'Nemotron 전체 색인' : 'Nemotron 부분 색인',
  };
}

export function toPersonaSeed(entry: NemotronPersonaEntry, metadata: NemotronIndexMetadata): PersonaSeed {
  const record = entry.record;
  const province = record.province?.trim() || '지역 미상';
  const district = record.district?.trim();
  const region = district ? `${province} ${district}` : province;
  const occupation = record.occupation?.trim() || '직업 미상';
  const ageGroup = `${Math.floor(record.age / 10) * 10}대`;

  return {
    id: `nemotron-${record.uuid}-${entry.personaType}`,
    label: `${region} ${ageGroup} ${occupation}`,
    ageGroup,
    region,
    occupation,
    background: entry.personaText,
    perspective: record.cultural_background || entry.personaText,
    voice: `${occupation}의 생활 경험을 바탕으로 조심스럽게 설명하는 말투`,
    livedExperiences: compact([
      entry.personaText,
      record.skills_and_expertise ? `경험과 전문성: ${record.skills_and_expertise}` : '',
      record.hobbies_and_interests ? `관심사: ${record.hobbies_and_interests}` : '',
    ]),
    concerns: compact([record.career_goals_and_ambitions || '', record.family_type ? `가족 형태: ${record.family_type}` : '']),
    tensions: compact([record.education_level ? `교육 수준과 생활 조건의 차이: ${record.education_level}` : '', record.housing_type ? `주거 조건: ${record.housing_type}` : '']),
    source: {
      kind: 'nemotron',
      sourceUuid: record.uuid,
      personaType: entry.personaType,
      sex: record.sex,
      age: record.age,
      province: record.province,
      district: record.district,
      occupation: record.occupation,
      educationLevel: record.education_level,
      familyType: record.family_type,
      housingType: record.housing_type,
      maritalStatus: record.marital_status,
      isCompleteIndex: metadata.isComplete,
      sourceRecordCount: metadata.sourceRecordCount,
      expandedPersonaCount: metadata.expandedPersonaCount,
    },
  };
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
