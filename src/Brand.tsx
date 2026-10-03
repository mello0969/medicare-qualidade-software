/** Identidade original publicada pela FHDOD em https://www.fhdod.com.br/images/logo.png. */
export default function Brand({ className = '' }: { className?: string }) {
  return (
    <a className={`brand hospital-brand ${className}`.trim()} href="#/">
      <img
        src={`${import.meta.env.BASE_URL}fhdod-logo.png`}
        alt="Fundação Hospitalar Dr. Oswaldo Diesel"
        width="450"
        height="150"
        decoding="async"
      />
    </a>
  );
}
