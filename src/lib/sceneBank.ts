import type { ConcreteScene, PersonaSeed, ResearchDraft, TopicCategory, TopicFrame } from '../types/research';

export function buildConcreteScenes(draft: ResearchDraft, persona: PersonaSeed, frame: TopicFrame): ConcreteScene[] {
  const topicScene = buildTopicScene(draft, persona, frame);
  const seedScenes = persona.livedExperiences.map((experience, index) =>
    buildSceneFromSeed(draft, persona, experience, index + (topicScene ? 2 : 1), frame.category),
  );

  return [topicScene, ...seedScenes].filter((scene): scene is ConcreteScene => Boolean(scene)).slice(0, 4);
}

function buildTopicScene(draft: ResearchDraft, persona: PersonaSeed, frame: TopicFrame): ConcreteScene | null {
  const category = frame.category;
  if (category === 'smartphone-sleep') return buildSmartphoneSleepScene(persona);
  if (category === 'school-meal') return buildSchoolMealScene(draft, persona);
  if (category === 'youth-work') return buildYouthWorkScene(draft, persona);
  if (category === 'climate-anxiety') return buildClimateAnxietyScene(draft, persona);
  return {
    id: `${persona.id}-topic-frame`,
    people: [persona.label, ...frame.affectedGroups.filter((group) => group !== persona.label).slice(0, 2)],
    ...frame.sceneSeed,
  };
}

function buildSmartphoneSleepScene(persona: PersonaSeed): ConcreteScene {
  return {
    id: `${persona.id}-smartphone-sleep-night`,
    setting: '평일 밤, 잠들기 전 침대와 단체 채팅방 알림 사이',
    people: [persona.label, '친구들', '같은 반 학생들'],
    action: '스마트폰으로 과제 공지와 친구 메시지를 확인하다가 수면 시간이 밀린다',
    pressure: persona.concerns[0] ?? '친구 관계와 학업 부담',
    feeling: '끊으면 불안하지만 계속 보면 피곤해지는 양가감정',
    consequence: '다음 날 집중력이 떨어지고 스마트폰 사용을 줄이겠다는 결심이 반복해서 약해진다',
    quoteSeed: '알림을 안 보면 뒤처질 것 같고, 보면 잠을 놓치는 느낌이에요.',
  };
}

function buildSchoolMealScene(draft: ResearchDraft, persona: PersonaSeed): ConcreteScene {
  return {
    id: `${persona.id}-school-meal-lunch`,
    setting: '점심시간 급식실과 오후 첫 수업 사이',
    people: [persona.label, '같은 반 친구들', '학교 구성원'],
    action: '급식 만족도가 낮은 날에는 식사를 대충 넘기고 오후 수업 집중력까지 흔들린다고 느낀다',
    pressure: persona.concerns[0] ?? '학업 부담과 생활 리듬',
    feeling: '사소한 불만처럼 보이지만 하루 컨디션에 영향을 준다는 답답함',
    consequence: `${draft.topic}을 단순 선호가 아니라 학교생활 리듬의 문제로 말하게 된다`,
    quoteSeed: '점심을 제대로 못 먹은 날은 오후 수업에서 집중력이 먼저 떨어지는 느낌이에요.',
  };
}

function buildYouthWorkScene(draft: ResearchDraft, persona: PersonaSeed): ConcreteScene {
  return {
    id: `${persona.id}-youth-work-shift`,
    setting: '방과 후 근무 시간과 다음 날 등교 준비가 겹치는 저녁',
    people: [persona.label, '친구들', '가족'],
    action: '아르바이트나 주변 친구의 근무 이야기를 들으며 공부 시간과 휴식 시간이 줄어드는 상황을 떠올린다',
    pressure: persona.concerns[0] ?? '시간 압박과 학업 부담',
    feeling: '돈이나 책임감은 이해하지만 학업 스트레스가 같이 커지는 긴장',
    consequence: `${draft.topic}을 개인 성실성 문제가 아니라 시간 배분과 생활 압박의 문제로 해석한다`,
    quoteSeed: '근무가 끝나고 나면 공부를 해야 하는 걸 알아도 몸이 먼저 지치는 것 같아요.',
  };
}

function buildClimateAnxietyScene(draft: ResearchDraft, persona: PersonaSeed): ConcreteScene {
  return {
    id: `${persona.id}-climate-anxiety-future`,
    setting: '학교에서 기후 뉴스나 폭염 이야기를 접한 뒤 친구들과 미래를 이야기하는 순간',
    people: [persona.label, '친구들', '학교 구성원'],
    action: '기후 문제를 들을 때 진로, 생활비, 지역 변화 같은 미래 걱정이 한꺼번에 떠오른다',
    pressure: persona.concerns[0] ?? '미래에 대한 막연한 압박',
    feeling: '당장 할 수 있는 일은 작고 문제는 커 보이는 불안',
    consequence: `${draft.topic}을 지식이나 태도 문제가 아니라 미래 인식과 감정의 문제로 말하게 된다`,
    quoteSeed: '기후 이야기를 들으면 내 미래가 이미 정해진 것처럼 불안해질 때가 있어요.',
  };
}

function buildSceneFromSeed(
  draft: ResearchDraft,
  persona: PersonaSeed,
  experience: string,
  index: number,
  category: TopicCategory,
): ConcreteScene {
  const tension = persona.tensions[index % persona.tensions.length] ?? persona.tensions[0] ?? '단정하기 어려운 긴장';
  const concern = persona.concerns[index % persona.concerns.length] ?? persona.concerns[0] ?? '생활 조건의 부담';
  const topicPhrase = topicPhraseFor(draft.topic, category);

  return {
    id: `${persona.id}-scene-${index}`,
    setting: inferSetting(experience, persona),
    people: inferPeople(persona, experience),
    action: `${experience} 이 장면에서 ${topicPhrase}을 떠올린다`,
    pressure: concern,
    feeling: tension,
    consequence: `${draft.topic}을 개인 선택만으로 말하기 어렵다는 판단으로 이어진다`,
    quoteSeed: `${experience.replace(/\.$/, '')} 그래서 ${concern}이 먼저 떠올라요.`,
  };
}

function inferSetting(experience: string, persona: PersonaSeed): string {
  if (experience.includes('통학')) return '등교 전후 대중교통과 학교 단체 채팅방';
  if (experience.includes('시험')) return '시험 기간 밤 시간과 집';
  if (experience.includes('동아리') || experience.includes('수행평가')) return '학교 활동 공지와 온라인 자료를 확인하는 시간';
  if (experience.includes('지역')) return `${persona.region}에서 정보를 찾는 생활 동선`;
  if (experience.includes('상담') || experience.includes('멘토')) return '지원 현장에서 당사자 이야기를 듣는 자리';
  return `${persona.region} ${persona.occupation}의 평소 생활 장면`;
}

function topicPhraseFor(topic: string, category: TopicCategory): string {
  if (category === 'smartphone-sleep') return `${topic}, 특히 스마트폰과 수면`;
  if (category === 'school-meal') return `${topic}, 특히 급식과 집중력`;
  if (category === 'youth-work') return `${topic}, 특히 근무 시간과 학업 스트레스`;
  if (category === 'climate-anxiety') return `${topic}, 특히 기후 불안과 미래 인식`;
  return topic;
}

function inferPeople(persona: PersonaSeed, experience: string): string[] {
  if (experience.includes('친구') || experience.includes('채팅')) return [persona.label, '친구들'];
  if (experience.includes('선생님') || experience.includes('학교')) return [persona.label, '학교 구성원'];
  if (experience.includes('가족') || experience.includes('자녀')) return [persona.label, '가족'];
  if (experience.includes('상담') || experience.includes('주민')) return [persona.label, '당사자'];
  return [persona.label, '주변 사람들'];
}
