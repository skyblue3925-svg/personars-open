import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import App from '../App';

beforeEach(() => {
  window.localStorage.clear();
});

test('opens as a generic classroom persona interview tool', () => {
  render(<App />);

  expect(screen.queryByText(/제작자/)).toBeNull();
  expect(screen.getByRole('heading', { name: '페르소나 인터뷰 도구' })).toBeTruthy();
  expect(screen.getByText(/교사가 주제와 맥락을 정하면/)).toBeTruthy();
  expect(screen.getByLabelText('과목')).toBeTruthy();
  expect(screen.getByLabelText('활동 유형')).toBeTruthy();
  expect(screen.getByLabelText('인터뷰 주제')).toBeTruthy();
  expect(screen.getByLabelText('인터뷰 목적')).toBeTruthy();

  expect(screen.queryByText(/연구보고서 생성기/)).toBeNull();
  expect(screen.queryByRole('button', { name: /설문/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /가설/ })).toBeNull();
});

test('starts persona selection from classroom activity settings', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText('과목'), { target: { value: '국어' } });
  fireEvent.change(screen.getByLabelText('활동 유형'), { target: { value: '작품·텍스트 독자 반응 탐색' } });
  fireEvent.change(screen.getByLabelText('인터뷰 주제'), { target: { value: '지역 서점이 청소년 독서 경험에 주는 영향' } });
  fireEvent.change(screen.getByLabelText('인터뷰 목적'), { target: { value: '서점 이용 경험과 독서 동기를 깊게 듣기' } });
  fireEvent.click(screen.getByRole('button', { name: '페르소나 선택하기' }));

  expect(screen.getByText('페르소나 고르기')).toBeTruthy();
  expect(screen.getAllByText(/지역 서점이 청소년 독서 경험에 주는 영향/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /설문/ })).toBeNull();
});

test('offers activity type presets and a custom activity type field', () => {
  render(<App />);

  expect(screen.getByRole('option', { name: '토론 준비' })).toBeTruthy();
  expect(screen.getByRole('option', { name: '작품·텍스트 독자 반응 탐색' })).toBeTruthy();
  expect(screen.getByRole('option', { name: '역사·사회 사건 현재 관점 비교' })).toBeTruthy();
  expect(screen.getByRole('option', { name: '진로·직업 탐색' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: '문학 작품 인물 관점 탐색' })).toBeNull();
  expect(screen.queryByRole('option', { name: '역사 인물·사건 관점 비교' })).toBeNull();
  expect(screen.getByText(/현대 대한민국 생활 맥락의 페르소나/)).toBeTruthy();
  expect(screen.getByText(/과거 인물이나 작품 속 인물을 직접 재현하지 않습니다/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText('활동 유형'), { target: { value: '직접 입력' } });
  fireEvent.change(screen.getByLabelText('활동 유형 직접 입력'), { target: { value: '실험 관찰 인터뷰' } });

  expect(screen.getByText('실험 관찰 인터뷰')).toBeTruthy();
});
