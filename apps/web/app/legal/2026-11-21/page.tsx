import {
  LegalDocumentContent,
  legalDocumentProse,
  legalDocuments,
} from "@/shared/legal/documents-2026-11-21";

export const metadata = {
  title: "이용약관 및 개인정보 안내 | 총무야",
  description: "총무야 이용약관, 가입 동의와 개인정보 처리방침",
};

export default function LegalDocumentsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-foreground sm:px-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold">총무야 이용약관 및 개인정보 안내</h1>
        <p className="mt-3 text-sm text-muted">
          시행일 <time dateTime="2026-11-21">2026년 11월 21일</time>
        </p>
        <nav aria-label="약관 목차" className="mt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            {legalDocuments.map(({ anchor, title }) => (
              <li key={anchor}>
                <a href={`#${anchor}`} className="text-link underline">
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="space-y-12">
        {legalDocuments.map(({ key, anchor, title }) => (
          <section
            key={key}
            aria-labelledby={anchor}
            className={legalDocumentProse}
          >
            <h2 id={anchor} className="mb-3 scroll-mt-5 text-xl font-bold">
              {title}
            </h2>
            <LegalDocumentContent id={key} />
          </section>
        ))}
      </div>
    </main>
  );
}
