import { useId, useRef, type ReactNode } from "react";
import { Dialog } from "./dialog";

export function NoticeDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      showCloseButton
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      initialFocusRef={heading}
      onClose={onClose}
      className="max-w-[362px] space-y-7 text-center"
    >
      <div>
        <h2
          ref={heading}
          id={`${id}-title`}
          tabIndex={-1}
          className="text-2xl leading-normal font-bold focus:outline-none"
        >
          {title}
        </h2>
        <p
          id={`${id}-description`}
          className="mt-2 text-control leading-normal break-keep text-foreground/80"
        >
          {description}
        </p>
      </div>
      <div className="flex flex-wrap gap-3.5 [&>*]:flex-1">{children}</div>
    </Dialog>
  );
}
