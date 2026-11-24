import { useFormContext } from "react-hook-form";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import type { SignupValues } from "../../schemas/signup.schema";
import type { useSignupFlow } from "../../hooks/use-signup-flow";
import { EmailVerification } from "./email-verification";
import { ContactVerification } from "../contact-verification";
import { StepHeading } from "@/shared/ui/step-layout";

const enrollmentInputClass = "shadow-control aria-invalid:bg-danger/10";
export function SignupInformation({
  phone,
  email,
  kakao = false,
  providerEmailVerified = false,
  loginHref,
}: Pick<ReturnType<typeof useSignupFlow>, "phone" | "email"> & {
  kakao?: boolean;
  providerEmailVerified?: boolean;
  loginHref?: string;
}) {
  const {
    register,
    trigger,
    formState: { errors },
  } = useFormContext<SignupValues>();
  return (
    <div className="px-[17px] max-[374px]:px-2">
      <StepHeading
        title="총무야에 오신 걸 환영해요!"
        description="총무 계정을 만들고 모임 준비를 시작해 보세요."
        className="text-foreground [&_p]:leading-[1.2]"
      />
      <div className="space-y-9">
        <EmailVerification
          email={email}
          trusted={providerEmailVerified}
          loginHref={loginHref}
        />
        <FormField
          required
          id="signup-name"
          label="이름"
          className="gap-2"
          labelClassName="text-label text-black/80"
          error={errors.name?.message}
        >
          {(attributes) => (
            <Input
              {...attributes}
              {...register("name")}
              variant="pill"
              className={enrollmentInputClass}
              autoComplete="name"
              placeholder="이름을 입력해주세요"
              required
            />
          )}
        </FormField>
        {!kakao && (
          <>
            <FormField
              required
              id="signup-password"
              label="비밀번호"
              className="gap-2"
              labelClassName="text-label text-black/80"
              error={errors.password?.message}
            >
              {(attributes) => (
                <PasswordInput
                  {...attributes}
                  {...register("password")}
                  variant="pill"
                  className={enrollmentInputClass}
                  hideToggleWhenEmpty
                  autoComplete="new-password"
                  placeholder="8~16자, 영문·숫자·특수문자 허용"
                  required
                />
              )}
            </FormField>
            <FormField
              required
              id="signup-passwordConfirm"
              label="비밀번호 확인"
              className="gap-2"
              labelClassName="text-label text-black/80"
              error={errors.passwordConfirm?.message}
            >
              {(attributes) => (
                <PasswordInput
                  {...attributes}
                  {...register("passwordConfirm")}
                  variant="pill"
                  className={enrollmentInputClass}
                  hideToggleWhenEmpty
                  autoComplete="new-password"
                  placeholder="비밀번호를 다시 입력해주세요"
                  required
                />
              )}
            </FormField>
          </>
        )}
        <ContactVerification
          {...phone}
          onRequest={(onIssued) => {
            void trigger("phone", { shouldFocus: true }).then((valid) => {
              if (valid) void phone.request(onIssued);
            });
          }}
          onCheck={phone.check}
          renderField={(requestButton) => (
            <FormField
              required
              id="signup-phone"
              label="전화번호"
              className="gap-2"
              labelClassName="text-label text-black/80"
              error={errors.phone?.message}
            >
              {(attributes) => (
                <div className="flex items-start gap-2">
                  <Input
                    {...attributes}
                    {...register("phone", { onChange: phone.reset })}
                    variant="pill"
                    className="min-w-0 shadow-control aria-invalid:bg-danger/10 max-[374px]:px-3 max-[374px]:placeholder:text-sm"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="전화번호를 입력해주세요"
                    required
                  />
                  {requestButton}
                </div>
              )}
            </FormField>
          )}
        />
      </div>
    </div>
  );
}
