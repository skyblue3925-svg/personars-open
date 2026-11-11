import { describe, expect, test } from 'vitest';
import { fallbackPersonas } from '../data/personas';
import { analyzeTopicFrame, buildInterviewCharacter, classifyTopic, scorePersonaRelevance } from '../lib/interviewCharacter';
import { createResearchDraft } from '../lib/researchDraft';

describe('interviewCharacter', () => {
  test('classifies smartphone and sleep topics as smartphone-sleep', () => {
    expect(classifyTopic('청소년 스마트폰 사용과 수면')).toBe('smartphone-sleep');
    expect(classifyTopic('밤 시간 휴대폰 알림이 잠에 미치는 영향')).toBe('smartphone-sleep');
  });

  test('gives a metropolitan high school student direct relevance for smartphone sleep topics', () => {
    const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);

    expect(character.persona.label).toBe('수도권 고등학생');
    expect(character.topicCategory).toBe('smartphone-sleep');
    expect(character.relevance).toBe('direct');
    expect(character.canSpeakTo.join(' ')).toContain('수면');
  });

  test('does not duplicate generic pressure wording in persona card scope text', () => {
    const draft = createResearchDraft('평등을 목적으로 한 교복의 불편함 유발 탐구');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);
    const scopeText = character.canSpeakTo.join(' ');

    expect(scopeText).not.toContain('당사자이');
    expect(scopeText).not.toContain('압박 압박');
  });

  test('builds complete concrete scenes', () => {
    const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);

    expect(character.concreteScenes.length).toBeGreaterThanOrEqual(3);
    for (const scene of character.concreteScenes) {
      expect(scene.setting).toBeTruthy();
      expect(scene.people.length).toBeGreaterThan(0);
      expect(scene.action).toBeTruthy();
      expect(scene.pressure).toBeTruthy();
      expect(scene.feeling).toBeTruthy();
      expect(scene.consequence).toBeTruthy();
      expect(scene.quoteSeed).toBeTruthy();
    }
  });

  test('scenes reflect the topic and persona seed', () => {
    const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
    const persona = fallbackPersonas[0];
    const character = buildInterviewCharacter(draft, persona);
    const sceneText = character.concreteScenes
      .map((scene) => Object.values(scene).flat().join(' '))
      .join(' ');

    expect(character.lifeContext).toContain(persona.background);
    expect(sceneText).toContain('스마트폰');
    expect(sceneText).toContain('수면');
    expect(sceneText).toContain('통학');
    expect(sceneText).toContain(persona.concerns[0]);
  });

  test('extracts a concrete dossier for any unfamiliar school-life topic', () => {
    const draft = createResearchDraft('학교 급식 만족도와 학생 집중력');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);
    const sceneText = character.concreteScenes.map((scene) => `${scene.setting} ${scene.action} ${scene.pressure}`).join(' ');

    expect(character.topicCategory).toBe('school-meal');
    expect(character.relevance).toBe('direct');
    expect(character.canSpeakTo.join(' ')).toContain('급식');
    expect(character.cannotSpeakTo.join(' ')).toContain('영양');
    expect(sceneText).toContain('점심');
    expect(sceneText).toContain('급식');
    expect(sceneText).toContain('집중력');
  });

  test('builds topic-specific boundaries and scenes for youth work topics', () => {
    const draft = createResearchDraft('청소년 아르바이트 경험과 학업 스트레스');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);
    const sceneText = character.concreteScenes.map((scene) => `${scene.setting} ${scene.action} ${scene.consequence}`).join(' ');

    expect(character.topicCategory).toBe('youth-work');
    expect(character.relevance).toBe('direct');
    expect(character.canSpeakTo.join(' ')).toContain('아르바이트');
    expect(character.cannotSpeakTo.join(' ')).toContain('노동법');
    expect(sceneText).toContain('근무');
    expect(sceneText).toContain('학업 스트레스');
  });

  test('does not leave broad unfamiliar topics as generic-only dossiers', () => {
    const draft = createResearchDraft('기후 불안과 청소년의 미래 인식');
    const character = buildInterviewCharacter(draft, fallbackPersonas[0]);
    const dossierText = [
      character.canSpeakTo.join(' '),
      character.cannotSpeakTo.join(' '),
      character.concreteScenes.map((scene) => `${scene.setting} ${scene.action} ${scene.feeling}`).join(' '),
    ].join(' ');

    expect(character.topicCategory).toBe('climate-anxiety');
    expect(character.relevance).toBe('adjacent');
    expect(dossierText).toContain('기후');
    expect(dossierText).toContain('미래');
    expect(dossierText).toContain('불안');
  });

  test('frames school violence as a social issue without a dedicated category branch', () => {
    const frame = analyzeTopicFrame('학교폭력 목격 경험과 신고 부담');

    expect(frame.affectedGroups).toContain('학생');
    expect(frame.places).toContain('학교');
    expect(frame.pressures).toContain('관계 안전');
    expect(frame.tensionAxes).toContain('침묵/신고');
    expect(frame.boundaries.join(' ')).toContain('가해자');
  });

  test('frames housing insecurity through money, home, and future pressure', () => {
    const frame = analyzeTopicFrame('청년 주거 불안과 취업 준비');

    expect(frame.affectedGroups).toContain('청년');
    expect(frame.places).toContain('집');
    expect(frame.pressures).toContain('돈');
    expect(frame.pressures).toContain('미래');
    expect(frame.sceneSeed.setting).toContain('집');
    expect(frame.sceneSeed.action).toContain('주거 불안');
  });

  test('uses topic frame to make persona relevance and scenes for elder care', () => {
    const draft = createResearchDraft('노인 돌봄 공백과 가족 부담');
    const character = buildInterviewCharacter(draft, fallbackPersonas[11]);
    const dossierText = [
      character.canSpeakTo.join(' '),
      character.cannotSpeakTo.join(' '),
      character.concreteScenes.map((scene) => `${scene.setting} ${scene.action} ${scene.pressure}`).join(' '),
    ].join(' ');

    expect(character.relevance).toBe('direct');
    expect(character.topicFrame.affectedGroups).toContain('노인');
    expect(dossierText).toContain('돌봄');
    expect(dossierText).toContain('가족');
    expect(dossierText).toContain('의학적 진단');
  });

  test.each([
    ['온라인 혐오 표현과 청소년 관계 갈등', ['학생'], ['온라인 공간'], ['관계 안전', '낙인']],
    ['장애 접근성과 지역 대중교통 이용', ['지역 주민'], ['통학길', '지역사회'], ['접근성']],
    ['이주 배경 청소년의 학교 적응', ['학생'], ['학교'], ['낙인', '학업']],
    ['정신건강 낙인과 도움 요청', ['당사자'], ['일상 공간'], ['낙인', '건강']],
    ['지역 의료 공백과 노인 이동 부담', ['노인', '지역 주민'], ['통학길', '지역사회'], ['접근성', '건강']],
    ['입시 경쟁과 고등학생 수면 부족', ['학생'], ['학교', '집'], ['학업', '건강']],
    ['교통 안전과 야간 귀가 불안', ['지역 주민'], ['통학길', '지역사회'], ['안전']],
  ])('frames broad social issue "%s"', (topic, groups, places, pressures) => {
    const frame = analyzeTopicFrame(topic);
    const frameText = [
      frame.affectedGroups.join(' '),
      frame.places.join(' '),
      frame.pressures.join(' '),
      frame.tensionAxes.join(' '),
      frame.boundaries.join(' '),
      frame.sceneSeed.setting,
      frame.sceneSeed.action,
    ].join(' ');

    for (const group of groups) expect(frame.affectedGroups).toContain(group);
    for (const place of places) expect(frame.places).toContain(place);
    for (const pressure of pressures) expect(frame.pressures).toContain(pressure);
    expect(frameText).toContain(topic);
    expect(frame.sceneSeed.quoteSeed).toContain(frame.pressures[0]);
  });

  test('scores persona relevance from group, place, pressure, and lived experience overlap', () => {
    const studentFrame = analyzeTopicFrame('입시 경쟁과 고등학생 수면 부족');
    const elderCareFrame = analyzeTopicFrame('노인 돌봄 공백과 가족 부담');
    const studentScore = scorePersonaRelevance(studentFrame, fallbackPersonas[0]);
    const elderScore = scorePersonaRelevance(elderCareFrame, fallbackPersonas[11]);

    expect(studentScore.score).toBeGreaterThanOrEqual(5);
    expect(studentScore.level).toBe('direct');
    expect(studentScore.reasons.join(' ')).toContain('집단');
    expect(elderScore.score).toBeGreaterThanOrEqual(5);
    expect(elderScore.level).toBe('direct');
    expect(elderScore.reasons.join(' ')).toContain('노인');
  });
});
