import Link from "next/link";

export const legalDocumentsVersion = "2026-11-21";
export const privacyPolicyHref = `/legal/${legalDocumentsVersion}#privacy-policy`;

export const legalDocuments = [
  { key: "serviceTerms", anchor: "service-terms", title: "서비스 이용약관" },
  {
    key: "privacyCollection",
    anchor: "privacy-collection",
    title: "가입 개인정보 수집 및 이용 동의 (필수)",
  },
  {
    key: "privacyPolicy",
    anchor: "privacy-policy",
    title: "개인정보 처리방침",
  },
  {
    key: "marketing",
    anchor: "marketing",
    title: "마케팅 정보 수신 동의 (선택)",
  },
] as const;

export type LegalDocumentId = (typeof legalDocuments)[number]["key"];

export const legalDocumentProse =
  "text-sm leading-relaxed break-keep [overflow-wrap:anywhere] [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0 [&_p+p]:mt-2";

const contact = (
  <a className="text-link underline" href="mailto:support@chongmuya.com">
    support@chongmuya.com
  </a>
);

const contents = {
  serviceTerms: (
    <>
      <h3>제1조 서비스</h3>
      <p>
        이동규가 운영하는 총무야는 단체 예약 문의와 모임의 참석·정산 관리를 돕는
        서비스입니다. 기본 기능은 무료입니다.
      </p>

      <h3>제2조 회원가입과 계정</h3>
      <p>
        약관에 동의하고 이메일 또는 카카오 가입 절차를 마치면 총무 계정이
        만들어집니다. 기존 매장 계정은 부여된 권한으로 매장 기능을 이용할 수
        있습니다. 행사 참여자는 주최 측이 보낸 링크나 QR로 참석 여부를 응답할 수
        있습니다.
      </p>
      <p>
        회원은 본인의 계정을 사용하고 인증 정보를 안전하게 관리해야 합니다. 명의
        도용이나 계정 양도는 금지합니다.
      </p>

      <h3>제3조 예약·취소·환불</h3>
      <p>
        <strong>예약은 화면에 ‘확정’으로 표시되면 완료됩니다.</strong> 매장을
        선택한 뒤 안내된 일정·인원·메뉴를 확인해 주세요. 예약금이 있는 경우에는
        매장의 입금 확인이 필요합니다.
      </p>
      <p>
        예약금과 식사 대금은 매장에 직접 지급하고, 모임 정산금은 구성원끼리
        주고받습니다. 예약 변경·취소와 환불은 매장과 전화로 협의해 주세요.
        환불은 사전에 안내된 예약 조건, 당사자 간 합의와 관계 법령에 따릅니다.
        문의 전달이나 진행 내역에 문제가 있으면 총무야에 문의할 수 있습니다.
      </p>

      <h3>제4조 모임 자료</h3>
      <p>
        모임 운영자는 참석 명단, 정산 내역과 증빙을 등록할 수 있습니다. 다른
        사람의 정보가 담긴 자료는 등록·공유할 권한을 확인하고, 행사에 필요하지
        않은 정보는 가려 주세요.
      </p>

      <h3>제5조 탈퇴와 이용 제한</h3>
      <p>
        회원은{" "}
        <Link className="text-link underline" href="/mypage/withdrawal">
          마이페이지의 회원 탈퇴
        </Link>
        에서 신청할 수 있습니다. 진행 중인 예약이 있으면 매장과 예약을 정리한 뒤
        다시 시도해 주세요. 모임이나 매장의 관리 권한 때문에 탈퇴를 완료하기
        어려운 경우 같은 화면에서 운영팀에 요청을 남길 수 있습니다. 로그인할 수
        없으면 {contact}으로 문의해 주세요. 공동 자료와 개인정보는 아래
        처리방침에 따라 관리합니다.
      </p>
      <p>
        명의 도용, 허위 예약, 개인정보 무단 공개 등으로 피해가 발생할 우려가
        있으면 필요한 범위에서 이용을 제한할 수 있습니다. 제한 사유와 이의 신청
        방법을 안내합니다.
      </p>

      <h3>제6조 변경과 문의</h3>
      <p>
        약관을 바꿀 때에는 변경 내용과 시행일을 사전에 알리고, 법령에 따라
        동의가 필요한 사항은 별도 동의를 받습니다. 서비스 문의와 분쟁은{" "}
        {contact}으로 접수합니다.
      </p>
    </>
  ),
  privacyCollection: (
    <>
      <dl className="space-y-2">
        <div>
          <dt className="font-semibold">이용 목적</dt>
          <dd>회원가입, 연락처 확인, 로그인 및 계정 관리</dd>
        </div>
        <div>
          <dt className="font-semibold">수집 항목</dt>
          <dd>
            이름, 이메일, 휴대전화번호, 가입·동의 기록, 인증 요청 및 확인 기록.
            이메일 가입 시 비밀번호, 카카오 가입 시 카카오 계정
            식별자·이메일·이메일 확인 여부
          </dd>
        </div>
        <div>
          <dt className="font-semibold">보유기간</dt>
          <dd>
            회원 정보는 탈퇴 시까지 보유합니다. 인증 요청과 결과는 인증 처리와
            부정 이용 확인에 필요한 기간 동안 보유합니다. 법령에 따라 보존할
            정보는 해당 기간 동안 별도로 보관합니다.
          </dd>
        </div>
      </dl>
      <p className="mt-3">
        <strong>동의를 거부할 수 있습니다.</strong> 필수 정보의 수집·이용에
        동의하지 않으면 가입을 완료할 수 없습니다.
      </p>
    </>
  ),
  privacyPolicy: (
    <>
      <p>총무야 운영자 이동규는 개인정보를 다음과 같이 처리합니다.</p>

      <h3>1. 처리 목적, 항목 및 보유기간</h3>
      <p>
        가입에 필요한 정보는 동의를 받아 처리합니다. 예약·참석·정산 등 이용자가
        요청한 서비스에 필요한 정보는 서비스 제공을 위해 처리합니다. 계정 보호와
        부정 이용 대응 기록은 정당한 이익이 인정되는 경우 필요한 범위에서
        처리합니다.
      </p>
      <dl className="mt-3 space-y-3">
        <div>
          <dt className="font-semibold">계정</dt>
          <dd>
            이름, 이메일, 휴대전화번호, 계정 식별자·유형, 닉네임 및 가입·동의
            기록을 처리합니다. 이메일 가입 시에는 비밀번호 확인 정보, 카카오
            가입 시에는 계정 식별자·이메일·이메일 확인 여부가 포함됩니다. 회원
            탈퇴 시까지 보유합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">인증과 보안</dt>
          <dd>
            인증에 쓴 연락처, 요청·인증·로그인 기록과 접속 정보는 인증, 계정
            보호와 부정 이용 대응에 필요한 기간 동안 보유합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">예약</dt>
          <dd>
            예약자와 매장 담당자의 이름·연락처, 문의·답변, 예약 조건,
            입금·변경·취소·환불 및 알림 발송 기록은 문의·예약을 처리하고 분쟁에
            대응하는 데 필요한 기간 동안 보유합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">참석과 정산</dt>
          <dd>
            참석자가 제출하거나 모임 운영자가 등록한 이름, 휴대전화번호 뒤
            4자리와 응답·정정 기록, 정산액, 등록한 계좌 정보와 증빙은 모임의
            참석 확인과 정산에 필요한 기간 동안 보유합니다. 모임 관리 권한이
            있는 이용자가 필요한 범위에서 열람합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">문의와 권리 행사</dt>
          <dd>
            회신 연락처, 문의·요청 내용과 처리 결과는 요청 처리와 분쟁 대응에
            필요한 기간 동안 보유합니다. 본인 확인용 자료는 확인이 끝나면
            파기합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">마케팅 선택</dt>
          <dd>
            계정 식별자와 선택·변경 기록은 동의 철회 또는 회원 탈퇴 때까지
            보유합니다.
          </dd>
        </div>
      </dl>

      <h3>2. 법령에 따른 보존 및 파기</h3>
      <p>
        전자상거래법과 시행령이 적용되는 거래 기록은 표시·광고 6개월,
        계약·청약철회 및 대금결제·공급 각 5년, 소비자 불만·분쟁 3년 동안
        보존합니다. 개인정보취급자의 처리시스템 접속기록은 「개인정보의 안전성
        확보조치 기준」에 따라 1년 이상, 해당 요건에 따라 2년 이상 보존합니다.
      </p>
      <p>
        처리 목적이 끝나거나 보유기간이 지나면 개인정보를 지체 없이 파기합니다.
        법령상 보존할 정보는 분리해 접근을 제한하고, 보존 기간이 끝나면
        파기합니다. 전자 기록은 복구할 수 없도록 삭제합니다.
      </p>

      <h3>3. 예약 매장에 제공하는 정보</h3>
      <p>
        문의를 받는 매장은 예약 가능 여부를 답할 수 있도록 예약자 이름, 일부를
        가린 휴대전화번호, 일정·인원과 요청사항을 확인할 수 있습니다. 선택한
        매장은 일정·메뉴 협의, 입금 확인과 변경·취소·환불 연락에 필요한 이름,
        전체 휴대전화번호와 예약 정보를 확인할 수 있습니다.
      </p>
      <p>
        제공받는 곳은 해당 문의 또는 예약의 매장입니다. 매장은 문의 또는
        예약·취소·환불 처리가 끝날 때까지 필요한 정보를 이용하고, 법정 보존
        대상은 해당 기간 동안 보관할 수 있습니다. 제공을 원하지 않으면 해당
        매장에 문의를 보내거나 예약을 진행하지 않을 수 있습니다.
      </p>

      <h3>4. 개인정보 처리 위탁</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li>주식회사 옥토버스(Octomo) — 휴대전화 인증</li>
        <li>솔라피 주식회사(SOLAPI) — 예약 안내 문자 발송</li>
        <li>Plus Five Five, Inc.(Resend) — 인증·재설정 메일 발송</li>
        <li>Amazon Web Services(AWS) — 서버·DB 운영과 첨부 저장</li>
        <li>Vercel Inc. — 웹 호스팅</li>
        <li>Cloudflare — 도메인 운영과 고객 문의 메일 전달</li>
        <li>네이버클라우드 주식회사 — 매장 주소 변환과 지도 표시</li>
      </ul>

      <h3>5. 국외 이전</h3>
      <p>
        인증과 계정 복구에 필요한 메일 발송 업무를 「개인정보 보호법」 제28조의8
        제1항 제3호 가목에 따라 위탁합니다.
      </p>
      <dl className="mt-3 space-y-2">
        <div>
          <dt className="font-semibold">받는 곳과 국가</dt>
          <dd>
            Plus Five Five, Inc.(Resend), 미국 ·{" "}
            <a className="text-link underline" href="mailto:privacy@resend.com">
              privacy@resend.com
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">항목과 이전 방법</dt>
          <dd>
            받는 사람의 이메일 주소, 메일 제목·본문과 발송 기록을 메일 발송 요청
            시 인터넷으로 전송합니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">목적과 보유기간</dt>
          <dd>
            인증·재설정 메일 발송과 결과 확인에 이용합니다. 메일과 발송 로그는
            30일, 백업은 7일 보관합니다. 총무야의 Resend 이용 종료 후 남은
            데이터는 90일 이내 삭제됩니다.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">이전 거부</dt>
          <dd>
            {contact}으로 요청할 수 있습니다. 거부하면 이메일 인증과 비밀번호
            재설정 이용이 제한될 수 있습니다.
          </dd>
        </div>
      </dl>

      <h3>6. 보호 조치와 쿠키</h3>
      <p>
        개인정보는 암호화된 연결로 전송합니다. 비밀번호는 원문을 알 수 없는
        형태로 저장하며, 개인정보 열람은 권한이 있는 사람으로 제한합니다.
      </p>
      <p>
        로그인 유지와 인증을 위해 쿠키를 사용합니다. 브라우저 설정에서 쿠키를
        삭제하거나 차단할 수 있으며, 차단하면 로그인과 일부 인증 기능이 제한될
        수 있습니다.
      </p>

      <h3>7. 권리 행사와 문의</h3>
      <p>
        회원과 비회원은 개인정보 열람·정정·삭제, 처리정지, 동의 철회와 수집 출처
        확인을 요청할 수 있습니다. 본인 또는 적법한 대리인이 개인정보 보호책임자
        이동규에게 {contact}으로 요청해 주세요.
      </p>
      <p>
        침해 신고는{" "}
        <a className="text-link underline" href="https://privacy.kisa.or.kr/">
          개인정보침해 신고센터
        </a>
        (118), 분쟁조정은{" "}
        <a className="text-link underline" href="https://www.kopico.go.kr/">
          개인정보 분쟁조정위원회
        </a>
        에 신청할 수 있습니다. 처리방침을 변경하면 시행일과 변경 내용을
        공개합니다.
      </p>
    </>
  ),
  marketing: (
    <>
      <p>
        가입 시 선택한 마케팅 수신 의향은 계정 식별자, 선택 여부와 시각과 함께
        동의 철회 또는 탈퇴 때까지 보유합니다. 선택 여부와 관계없이 가입하고
        서비스를 이용할 수 있습니다.
      </p>
      <p>
        총무야는 현재 광고성 정보 발송에 이 선택을 사용하지 않습니다. 광고를
        보내게 되면 발송 채널별로 별도 동의를 받습니다. 기존 선택은 {contact}
        으로 철회할 수 있습니다.
      </p>
    </>
  ),
};

export function LegalDocumentContent({ id }: { id: LegalDocumentId }) {
  return contents[id];
}
