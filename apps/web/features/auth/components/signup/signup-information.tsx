import { useFormContext } from "react-hook-form";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import type { SignupValues } from "../../schemas/signup.schema";
import type { useSignupFlow } from "../../hooks/use-signup-flow";
import { ContactVerification } from "../contact-verification";
import { StepHeading } from "@/shared/ui/step-layout";

export const enrollmentInputClass = "shadow-control aria-invalid:bg-brand/10";
export function SignupInformation({
  phone,
}: Pick<ReturnType<typeof useSignupFlow>, "phone">) {
  const {
    register,
    trigger,
    formState: { errors },
  } = useFormContext<SignupValues>();
  return (
    <div className="px-[17px]">
      <StepHeading
        title="총무야에 오신 걸 환영해요!"
        description="계정을 만들고 모임 준비를 시작해 보세요."
      />
      <div className="space-y-9">
        <div>
          <FormField
            required
            id="signup-email"
            label="이메일"
            labelClassName="text-label"
            error={errors.email?.message}
          >
            {(attributes) => (
              <Input
                {...attributes}
                {...register("email")}
                variant="pill"
                className={enrollmentInputClass}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="chongmuya@gmail.com"
                required
              />
            )}
          </FormField>
        </div>
        <FormField
          required
          id="signup-name"
          label="이름"
          labelClassName="text-label"
          error={errors.name?.message}
        >
          {(attributes) => (
            <Input
              {...attributes}
              {...register("name")}
              variant="pill"
              className={enrollmentInputClass}
              autoComplete="name"
              placeholder="이름을 입력해 주세요"
              required
            />
          )}
        </FormField>
        <FormField
          required
          id="signup-password"
          label="비밀번호"
          labelClassName="text-label"
          hint="8~16자, 공백 없이 영문·숫자·일반 특수문자 허용. 문자 종류별 필수 조합은 없어요."
          error={errors.password?.message}
        >
          {(attributes) => (
            <PasswordInput
              {...attributes}
              {...register("password")}
              variant="pill"
              className={enrollmentInputClass}
              autoComplete="new-password"
              placeholder="8~16자 비밀번호"
              required
            />
          )}
        </FormField>
        <FormField
          required
          id="signup-passwordConfirm"
          label="비밀번호 확인"
          labelClassName="text-label"
          error={errors.passwordConfirm?.message}
        >
          {(attributes) => (
            <PasswordInput
              {...attributes}
              {...register("passwordConfirm")}
              variant="pill"
              className={enrollmentInputClass}
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력해 주세요"
              required
            />
          )}
        </FormField>
        <div>
          <FormField
            required
            id="signup-phone"
            label="전화번호"
            labelClassName="text-label"
            error={errors.phone?.message}
          >
            {(attributes) => (
              <Input
                {...attributes}
                {...register("phone", { onChange: phone.reset })}
                variant="pill"
                className={enrollmentInputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01012345678"
                required
              />
            )}
          </FormField>
          <ContactVerification
            label="휴대폰"
            {...phone}
            onRequest={() => {
              void trigger("phone", { shouldFocus: true }).then((valid) => {
                if (valid) void phone.request();
              });
            }}
            onCheck={phone.check}
          />
        </div>
      </div>
    </div>
  );
}

export function SignupNickname({ disabled }: { disabled?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<SignupValues>();
  return (
    <div className="px-[17px]">
      <StepHeading
        title="어떻게 불러드릴까요?"
        description="가입 정보의 이름과 별도로, 총무야에서 사용할 닉네임을 설정해 주세요."
      />
      <FormField
        required
        id="signup-nickname"
        label="닉네임"
        labelClassName="text-label"
        error={errors.nickname?.message}
      >
        {(attributes) => (
          <Input
            {...attributes}
            {...register("nickname")}
            disabled={disabled}
            variant="pill"
            className={enrollmentInputClass}
            autoComplete="nickname"
            placeholder="닉네임을 입력해 주세요"
            required
          />
        )}
      </FormField>
    </div>
  );
}
