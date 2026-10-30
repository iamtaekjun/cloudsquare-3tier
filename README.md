# NCP 3-Tier Todo Calendar

Naver Cloud Platform(NCP) 위에 Web / WAS / DB 3계층 구조를 설계하고, 그 위에서 동작하는 Todo 캘린더 서비스를 구현한 프로젝트입니다.

> (주)클라우드스퀘어 현장실습(2026.01~02) 1차 과제입니다. 3-Tier 설계 → 추가 요구사항 반영 → 발표·피드백 순서로 진행했으며, 실습 환경에서 구축·검증한 결과물로 실서비스 운영 이력은 없습니다.
>
> 애플리케이션(React·Express), Terraform, 배포 워크플로 코드는 AI의 도움을 받아 작성했고, 직접 NCP에 배포해 동작을 확인하며 문제를 수정했습니다.

## 아키텍처

```
Internet
   │
Public LB ──► Web #1 / Web #2 (Nginx, 정적 파일)
                  │
             Private LB ──► WAS #1 / WAS #2 (Node.js, pm2)
                                 │
                              DB (MySQL)
                                 │
            NAT Gateway (private 서브넷 아웃바운드)

외부 연동: NCP Object Storage(이미지), NCP KMS(필드 암호화), Gmail SMTP(알림)
```

- 서브넷 분리: public LB / web / private LB / was / db
- 계층별 ACG로 바로 앞 계층에서 오는 트래픽만 허용
- private 서브넷은 NAT Gateway를 통해서만 외부로 나감

## 구성 요소

| 영역 | 내용 |
|---|---|
| IaC | `terraform/` — VPC, 서브넷, NAT Gateway, Route Table, ACG, Network ACL, Public/Private LB, Target Group |
| CI/CD | `.github/workflows/deploy.yml` — self-hosted runner에서 프론트 빌드 후 Web 2대에 배포, 백엔드는 WAS 2대에 배포 후 pm2 재시작 |
| Frontend | React 18 + Vite |
| Backend | Express, mysql2, JWT 인증(bcrypt), multer |
| 스토리지 | NCP Object Storage (S3 호환 SDK). Presigned URL 직접 업로드와 WAS 경유 업로드를 둘 다 구현해 속도를 비교함 |
| 보안 | NCP KMS로 Todo 제목 컬럼 암호화/복호화 |
| 알림 | node-cron(1분 주기) + nodemailer로 예약 시간 이메일 발송 |

서버 인스턴스는 Terraform 범위 밖(콘솔)에서 생성했고, Terraform은 네트워크·보안·LB 계층을 다룹니다.

## 주요 API

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스 체크 (LB 대상) |
| POST | `/api/auth/register`, `/api/auth/login` | 회원가입 / 로그인 (JWT 발급) |
| GET | `/api/todos`, `/api/todos/calendar` | Todo 목록 / 캘린더 조회 |
| POST / DELETE | `/api/todos`, `/api/todos/:id` | Todo 생성 / 삭제 |
| GET | `/api/upload-url` | Object Storage Presigned URL 발급 |
| POST | `/api/upload-direct` | WAS 경유 업로드 (비교용) |

## 실행

```bash
# backend
cd backend && cp .env.example .env   # DB, JWT_SECRET, NCP 키, SMTP 값 입력
npm install && node src/index.js

# frontend
cd frontend && npm install && npm run dev

# infra
cd terraform && cp terraform.tfvars.example terraform.tfvars
terraform init && terraform plan
```

## 트러블슈팅 기록

- **캘린더 날짜가 하루씩 밀림**: `toISOString()`이 UTC 기준으로 날짜를 자르면서 KST 자정~오전 9시 사이 날짜가 전날로 바뀜. 선택값과 DB 응답 모두 로컬 연·월·일로 직접 포맷하도록 수정
- **KMS 암호화 호출 실패**: 응답 구조를 로그로 확인해 보니 요청 URL 경로에 KeyTag가 빠져 있었음. 경로에 KeyTag를 포함해 해결
- **배포 워크플로 SSH 실패**: 키 경로와 배포 디렉터리를 절대 경로로 명시하고, 대상 디렉터리를 미리 생성하도록 수정

## 한계와 개선할 점

- 배포가 root 계정 SSH와 `StrictHostKeyChecking=no`에 의존함 → 배포 전용 계정 + known_hosts 고정이 필요
- WAS-1이 self-hosted runner를 겸하고 있어 배포와 서비스가 같은 호스트를 씀
- DB 단일 구성(이중화 없음), 서버 인스턴스가 Terraform 밖에서 관리됨
