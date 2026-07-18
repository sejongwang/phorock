# Third-Party Attributions

## ZIPA — 다국어 음소인식 모델 (핵심 의존성)

이 프로젝트의 음소인식은 **ZIPA** (`zipa-large-crctc-ns-800k`, int8 ONNX)를 사용합니다.

- 원저장소: <https://github.com/lingjzhu/zipa> (MIT License)
- 모델 가중치: <https://huggingface.co/anyspeech/zipa-large-crctc-ns-800k>
  (`model.int8.onnx`, `tokens.txt` — HF 레포에 라이선스 태그가 없어 원저장소의 MIT를 따르는 것으로 표기)
- 논문: Zhu et al., *ZIPA: A family of efficient models for multilingual phone recognition*, ACL 2025
- 모델 가중치는 이 레포에 포함되지 않으며 위 HF 레포에서 직접 다운로드합니다.

> MIT License — Copyright (c) 2025 jzhu
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction — subject to inclusion of the above
> copyright notice and this permission notice in all copies or substantial
> portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
> OF ANY KIND. (전문: 원저장소 LICENSE 파일)

인용:

```bibtex
@inproceedings{zhu-etal-2025-zipa,
    title = "{ZIPA}: A family of efficient models for multilingual phone recognition",
    author = "Zhu, Jian and Samir, Farhan and Chodroff, Eleanor and Mortensen, David R.",
    booktitle = "Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)",
    month = jul,
    year = "2025",
    address = "Vienna, Austria",
    publisher = "Association for Computational Linguistics",
    pages = "19568--19585",
    doi = "10.18653/v1/2025.acl-long.961"
}
```

추론 전처리(lhotse Kaldi-호환 Fbank 설정)는 원저장소의 `inference/` 레퍼런스 구현을 따랐습니다.

## 런타임 의존성

| 패키지 | 라이선스 | 용도 |
|---|---|---|
| [lhotse](https://github.com/lhotse-speech/lhotse) | Apache-2.0 | Kaldi-호환 fbank 특징 추출 |
| [onnxruntime](https://github.com/microsoft/onnxruntime) | MIT | int8 모델 추론 (CoreML EP) |
| [PyTorch / torchaudio](https://pytorch.org) | BSD-3 | 텐서 연산·리샘플 |
| [python-soundfile](https://github.com/bastibe/python-soundfile) | BSD-3 | 오디오 로드 |
| [FastAPI](https://github.com/fastapi/fastapi) / uvicorn | MIT / BSD-3 | API 서버 |

## 데모 오디오

`data/clips*/`의 힝글리시 클립은 macOS `say`(Lekha 보이스)로 생성한 **합성음성**입니다
(실제 인물·통화 아님, 데모·평가 목적). `design/audio/`의 클립은 소유한 Claude Design
프로젝트에서 가져온 합성 샘플입니다.

## 디자인

`app/`·`design/`의 UI는 Astryx 디자인 시스템 CSS(`astryx.css`, Meta Platforms 저작권 고지 포함)를
사용한 자체 Claude Design 프로젝트 산출물을 기반으로 합니다.
