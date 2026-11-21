"use client";

import { useEffect, useRef, useState } from "react";
import { LegalDocumentContent, legalDocuments } from "@/shared/legal/documents";
import { LegalDocumentReader } from "@/shared/legal/legal-document-reader";
import { MenuArrow } from "@/shared/ui/menu-link";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";

type LegalDocument = (typeof legalDocuments)[number];

export function AccountTermsScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<LegalDocument | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const opener = useRef<LegalDocument["key"] | null>(null);
  const close = () => setSelected(null);

  useEffect(() => {
    if (selected) {
      container.current?.querySelector<HTMLElement>("h1")?.focus();
    } else if (opener.current) {
      container.current
        ?.querySelector<HTMLElement>(
          `[data-legal-document="${opener.current}"]`,
        )
        ?.focus();
    }
  }, [selected]);

  return (
    <div ref={container}>
      <StepLayout
        title=""
        onBack={selected ? close : onBack}
        className={selected ? "h-svh min-h-0" : undefined}
      >
        {selected ? (
          <LegalDocumentReader
            title={selected.title}
            actionLabel="닫기"
            onAction={close}
          >
            <LegalDocumentContent id={selected.key} />
          </LegalDocumentReader>
        ) : (
          <>
            <StepHeading title="약관 및 개인정보 처리방침" className="mb-5" />
            <ul className="divide-y divide-border">
              {legalDocuments.map((document) => (
                <li key={document.key}>
                  <button
                    type="button"
                    data-legal-document={document.key}
                    className="flex min-h-control w-full cursor-pointer items-center justify-between gap-3 py-2 text-left text-base"
                    onClick={() => {
                      opener.current = document.key;
                      setSelected(document);
                    }}
                  >
                    {document.title}
                    <MenuArrow />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </StepLayout>
    </div>
  );
}
