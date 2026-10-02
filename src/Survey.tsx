import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle,
  CaretLeft,
  Heart,
  Smiley,
  SmileyMeh,
  SmileySad,
  ShieldCheck,
} from '@phosphor-icons/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { SECTORS, isSector, sectorName, type SectorId, type Question, type Shift } from './domain';
import { loadQuestions, saveResponse } from './storage';

gsap.registerPlugin(useGSAP);
const labels = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom'];
const Faces = [SmileySad, SmileySad, SmileyMeh, Smiley, Smiley];

export default function Survey({ sector }: { sector?: string }) {
  const [selected, setSelected] = useState<SectorId[]>(isSector(sector) ? [sector] : []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(-1);
  const [values, setValues] = useState<Record<string, number>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [shift, setShift] = useState<Shift>('nao-informado');
  const [doctor, setDoctor] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const id = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const success = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const count = questions.length + 2;
  const question = questions[step];
  useEffect(() => {
    if (started.current) heading.current?.focus();
    started.current = true;
  }, [step, done]);
  useGSAP(
    () => {
      if (done && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.fromTo(
          '.success-icon',
          { scale: 0.9 },
          { scale: 1, duration: 0.24, ease: 'power2.out' },
        );
      }
    },
    { scope: success, dependencies: [done], revertOnUpdate: true },
  );

  function start() {
    if (!selected.length) {
      setError('Selecione pelo menos um setor por onde você passou.');
      return;
    }
    try {
      setQuestions(loadQuestions().filter((q) => selected.includes(q.sectorId)));
      setError('');
      setStep(0);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function next() {
    if (question && values[question.id] === undefined) {
      setError('Escolha uma nota ou selecione “Não sei avaliar”.');
      return;
    }
    setError('');
    setStep((s) => s + 1);
  }
  function submit() {
    if (saving || done) return;
    setSaving(true);
    setError('');
    try {
      saveResponse({
        id: id.current,
        createdAt: new Date().toISOString(),
        sectorIds: selected,
        answers: questions
          .filter((q) => values[q.id] > 0)
          .map((q) => ({
            questionId: q.id,
            questionText: q.text,
            questionVersion: q.version,
            sectorId: q.sectorId,
            value: values[q.id],
          })),
        nps,
        comment: comment.trim(),
        shift,
        doctor: doctor.trim(),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (sector && !isSector(sector))
    return (
      <main className="simple-page">
        <h1>Setor não encontrado</h1>
        <p>Confira o endereço ou escolha um setor na pesquisa.</p>
        <a className="button primary" href="#/pesquisa">
          Escolher setor
        </a>
      </main>
    );

  return (
    <div className="survey-shell">
      <aside className="survey-aside">
        <a href="#/" className="brand light">
          <span className="brand-mark">M</span>MediCare<span className="brand-dot">.</span>
        </a>
        <div className="survey-intro">
          <Heart size={42} weight="light" aria-hidden="true" />
          <h2>Ouvir você faz parte do cuidado.</h2>
          <p>Sua experiência ajuda a entender o que funciona e o que pode melhorar.</p>
        </div>
        <div className="aside-note">
          <ShieldCheck size={22} aria-hidden="true" />
          <p>Não pedimos seu nome, documento ou informações sobre sua saúde.</p>
        </div>
        <span className="aside-project">Projeto acadêmico · versão de demonstração</span>
      </aside>
      <main className="survey-main" id="conteudo">
        <div className="survey-top">
          <a className="text-link" href="#/">
            <CaretLeft aria-hidden="true" /> Voltar ao painel
          </a>
          <span>Pesquisa de satisfação</span>
        </div>
        <div className="survey-content" ref={success}>
          {!done && (
            <div className="survey-progress">
              <div className="progress-label">
                <span>{step < 0 ? 'Vamos começar' : `Etapa ${step + 1} de ${count}`}</span>
                <span>{sector ? sectorName(sector) : 'Sua experiência'}</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Progresso da pesquisa"
                aria-valuemin={0}
                aria-valuemax={count}
                aria-valuenow={Math.max(0, step + 1)}
              >
                <span style={{ width: `${(Math.max(0, step + 1) / count) * 100}%` }} />
              </div>
            </div>
          )}
          {done ? (
            <div className="success-state">
              <CheckCircle className="success-icon" size={76} weight="light" aria-hidden="true" />
              <h1 ref={heading} tabIndex={-1}>
                Obrigado por compartilhar.
              </h1>
              <p>Sua resposta foi salva neste navegador.</p>
              <p className="muted">
                Esta é uma demonstração acadêmica. A resposta não foi enviada a um hospital.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setDone(false);
                  setStep(-1);
                  setValues({});
                  setNps(null);
                  setComment('');
                  setShift('nao-informado');
                  setDoctor('');
                  id.current = crypto.randomUUID();
                }}
              >
                Iniciar outra pesquisa
              </button>
              <a className="text-link" href="#/painel?dados=locais">
                Ver a resposta no painel
              </a>
            </div>
          ) : (
            <>
              {step < 0 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    {sector
                      ? `Vamos falar sobre ${sector === 'medico' ? 'o atendimento médico' : sector === 'raio-x' ? 'o Raio X' : `a ${sectorName(sector).toLowerCase()}`}?`
                      : 'Por onde você passou?'}
                  </h1>
                  <p className="survey-description">
                    {sector
                      ? 'Responda com calma. Você pode pular uma pergunta se não souber avaliar.'
                      : 'Selecione os setores que fizeram parte do seu atendimento. Vamos perguntar só sobre eles.'}
                  </p>
                  <fieldset className="sector-choices">
                    <legend className="sr-only">Setores utilizados</legend>
                    {SECTORS.filter((s) => !sector || s.id === sector).map((s) => (
                      <label
                        className={`sector-choice ${selected.includes(s.id) ? 'selected' : ''}`}
                        key={s.id}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, s.id]
                                : selected.filter((id) => id !== s.id),
                            );
                            setError('');
                          }}
                        />
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.description}</small>
                        </span>
                        <Check className="choice-check" aria-hidden="true" />
                      </label>
                    ))}
                  </fieldset>
                  <div className="privacy-note">
                    <ShieldCheck size={20} aria-hidden="true" />
                    <span>
                      Use somente informações fictícias nesta versão. As respostas ficam salvas
                      neste navegador e podem ser vistas no painel.
                    </span>
                  </div>
                  <button className="button primary wide" onClick={start}>
                    Começar pesquisa
                  </button>
                </>
              ) : question ? (
                <>
                  <span className="step-context">{sectorName(question.sectorId)}</span>
                  <h1 ref={heading} tabIndex={-1}>
                    {question.text}
                  </h1>
                  <p className="survey-description">
                    Escolha a opção que melhor representa sua experiência.
                  </p>
                  <fieldset className="rating-options">
                    <legend className="sr-only">Nota de 1 a 5</legend>
                    {labels.map((label, i) => {
                      const Face = Faces[i];
                      return (
                        <label
                          className={`rating-option rating-${i + 1} ${values[question.id] === i + 1 ? 'selected' : ''}`}
                          key={label}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={i + 1}
                            checked={values[question.id] === i + 1}
                            onChange={() => {
                              setValues({ ...values, [question.id]: i + 1 });
                              setError('');
                            }}
                          />
                          <Face
                            size={46}
                            weight={values[question.id] === i + 1 ? 'fill' : 'regular'}
                            aria-hidden="true"
                          />
                          <strong>{i + 1}</strong>
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                  <label className="skip-choice">
                    <input
                      type="radio"
                      name={question.id}
                      checked={values[question.id] === 0}
                      onChange={() => {
                        setValues({ ...values, [question.id]: 0 });
                        setError('');
                      }}
                    />
                    Não sei avaliar
                  </label>
                </>
              ) : step === questions.length ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Você recomendaria o hospital a um familiar?
                  </h1>
                  <p className="survey-description">
                    De 0 a 10, qual seria a chance de você recomendar?
                  </p>
                  <fieldset className="nps-options">
                    <legend className="sr-only">Chance de recomendar de 0 a 10</legend>
                    {Array.from({ length: 11 }, (_, value) => (
                      <label className={nps === value ? 'selected' : ''} key={value}>
                        <input
                          type="radio"
                          name="nps"
                          checked={nps === value}
                          onChange={() => setNps(value)}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="nps-captions">
                    <span>0 · Não recomendaria</span>
                    <span>10 · Recomendaria muito</span>
                  </div>
                  <label className="skip-choice">
                    <input
                      type="radio"
                      name="nps"
                      checked={nps === null}
                      onChange={() => setNps(null)}
                    />
                    Prefiro não responder
                  </label>
                </>
              ) : (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Quer nos contar algo mais?
                  </h1>
                  <p className="survey-description">
                    Um elogio ou uma sugestão faz diferença. Esta etapa é opcional.
                  </p>
                  <label className="field-label" htmlFor="comment">
                    Seu comentário
                  </label>
                  <textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={600}
                    rows={4}
                    placeholder="Conte como foi sua experiência. Não inclua nomes ou informações de saúde."
                  />
                  <span className="character-count">{comment.length}/600</span>
                  <details className="extra-context">
                    <summary>Identificar o atendimento (opcional)</summary>
                    <p>Use códigos fictícios para experimentar os filtros do painel.</p>
                    <div className="field-grid">
                      <label>
                        Plantão
                        <select value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
                          <option value="nao-informado">Não sei informar</option>
                          <option value="par">Par</option>
                          <option value="impar">Ímpar</option>
                        </select>
                      </label>
                      <label>
                        Código do profissional
                        <input
                          value={doctor}
                          onChange={(e) => setDoctor(e.target.value)}
                          maxLength={40}
                          placeholder="Ex.: Profissional A"
                        />
                      </label>
                    </div>
                  </details>
                  <p className="muted small">
                    Nesta etapa do projeto, a pesquisa não solicita nem encaminha pedidos de
                    retorno.
                  </p>
                </>
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              {step >= 0 && (
                <div className="survey-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError('');
                      setStep((s) => s - 1);
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    onClick={step === questions.length + 1 ? submit : next}
                    disabled={saving}
                  >
                    {saving
                      ? 'Salvando…'
                      : step === questions.length + 1
                        ? 'Concluir pesquisa'
                        : 'Continuar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="survey-footer">MediCare · Sua experiência importa.</footer>
      </main>
    </div>
  );
}
