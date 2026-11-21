import { legalDocumentsVersion } from "@/shared/legal/documents";
import {
  LegalDocumentsPage,
  legalPageMetadata,
} from "@/shared/legal/legal-documents-page";

export const metadata = legalPageMetadata;

export default function Page() {
  return <LegalDocumentsPage version={legalDocumentsVersion} />;
}
