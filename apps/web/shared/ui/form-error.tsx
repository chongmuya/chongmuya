export function FormError({ id, message }: { id?: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 text-sm text-danger">
      {message}
    </p>
  ) : null;
}
