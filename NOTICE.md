# NOTICE

## Nemotron-Personas-Korea

`public/data/nemotron-persona-packet.json`은 NVIDIA가 제공한
[Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea)에서
추출하고 이 앱의 형식으로 재구성한 샘플을 포함합니다.

- 제공: NVIDIA Corporation (원 데이터셋 제작자 목록은 위 데이터셋 카드 참조)
- 원본: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea
- 라이선스: Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/
- 원 데이터셋은 한국의 실제 인구통계 분포를 바탕으로 합성한 **가상의 인물**이며, 실존 인물이 아닙니다.

### 변경 사항

원본에서 다음과 같이 바꿨습니다(`scripts/build-nemotron-persona-index.py` 참조).

1. 원본에서 (페르소나 유형, 시도, 연령대, 성별) 층마다 최대 3개를 고정 시드(20260429)로 무작위 추출했습니다. 전체가 아니라 일부 표본입니다.
2. 추출한 레코드를 이 앱의 형식으로 **재구성**했습니다. 원본의 서술 문장(페르소나 서술, 문화적 배경, 경험과 전문성, 관심사, 경력 목표, 가족 형태, 교육 수준, 주거 형태)은 앞뒤 공백 제거 외에는 고치지 않고 `background`, `perspective`, `livedExperiences`, `concerns`, `tensions` 필드에 나누어 담았습니다. 일부는 "경험과 전문성:", "관심사:" 같은 이름표를 앞에 붙였습니다.
3. 이 저장소가 **새로 만들어 넣은** 값이 있습니다. `label`(지역·연령대·직업을 이어 붙인 이름)과 `voice`(정형화된 말투 설명 문구)는 원 데이터셋의 내용이 아닙니다.
4. 원본의 식별자(uuid)와 인구통계 값 일부는 `source` 필드에 보존했습니다.

### 보증 부인

이 자료는 "있는 그대로" 제공되며, 별도로 약속하지 않는 한 원 제공자와 이 저장소의 기여자는 자료에 대해 어떠한 명시적·묵시적 보증도 하지 않습니다. 자세한 내용은 CC BY 4.0 라이선스 제5절(Disclaimer of Warranties and Limitation of Liability)을 따릅니다: https://creativecommons.org/licenses/by/4.0/legalcode#s5

NVIDIA는 이 저장소와 제휴하거나 이를 보증하지 않으며, 위 변경 사항은 이 저장소가 한 것입니다.

### 인용

데이터셋 카드가 안내하는 인용 형식입니다.

```bibtex
@software{nvidia/Nemotron-Personas-Korea,
  author = {Kim, Hyunwoo and Ryu, Jihyeon and Lee, Jinho and Ryu, Hyungon and Praveen, Kiran and Prayaga, Shyamala and Thadaka, Kirit and Jennings, Will and Sadeghi, Bardiya and Sharabiani, Ashton and Choi, Yejin and Meyer, Yev},
  title = {Nemotron-Personas-Korea: Synthetic Personas Aligned to Real-World Distributions for Korea},
  month = {April},
  year = {2026},
  url = {https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea}
}
```
