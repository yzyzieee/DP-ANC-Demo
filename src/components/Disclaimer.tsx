interface Props {
  text: string;
}

/** Persistent research-integrity disclaimer (plan §10). */
export function Disclaimer({ text }: Props) {
  return (
    <div className="disclaimer" role="note">
      <strong>Offline auralization.</strong> {text}
    </div>
  );
}
