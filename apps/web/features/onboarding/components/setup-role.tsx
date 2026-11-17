import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";
import { ChoiceCard } from "@/shared/ui/choice-card";
import { FormError } from "@/shared/ui/form-error";
import type { RoleValues } from "../schemas/first-setup.schema";

export function SetupRole() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<RoleValues>();
  const accountType = useWatch({ control, name: "accountType" });
  return (
    <>
      <h1
        tabIndex={-1}
        className="px-[17px] text-2xl leading-[1.2] font-bold focus:outline-none"
      >
        총무야를 어떻게
        <br />
        이용하시나요?
      </h1>
      <fieldset
        className="mt-[68px] grid grid-cols-2 gap-5 px-[5px]"
        aria-describedby={errors.accountType ? "role-error" : undefined}
      >
        <legend className="sr-only">이용 유형</legend>
        <ChoiceCard
          {...register("accountType")}
          value="owner"
          className="min-h-40 justify-between py-6"
        >
          <Image
            src="/images/enrollment/owner.svg"
            alt=""
            width={48.0882}
            height={43}
          />
          <span className="text-label">
            매장을 운영하는
            <br />
            사장님이에요
          </span>
        </ChoiceCard>
        <ChoiceCard
          {...register("accountType")}
          value="organizer"
          className="min-h-40 justify-between py-6"
        >
          <Image
            src="/images/enrollment/organizer.svg"
            alt=""
            width={48.2866}
            height={42.9717}
          />
          <span className="text-label">
            모임을 준비하는
            <br />
            총무예요
          </span>
        </ChoiceCard>
      </fieldset>
      <div className="mt-4 px-[17px]">
        <FormError id="role-error" message={errors.accountType?.message} />
        {accountType === "owner" && (
          <p className="text-caption text-muted">
            사장님으로 시작할 수 있어요. 매장 상세 등록은 준비 중이에요.
          </p>
        )}
      </div>
    </>
  );
}
