"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ExtensionUiRequest } from "@/lib/types";
import { Button } from "../ui/Button";
import styles from "./question-request-panel.module.css";

export type QuestionRequest = Extract<ExtensionUiRequest, { method: "ask" }>;

interface QuestionAnswers {
  selectedOptions: Record<string, number[]>;
  customAnswers: Record<string, string>;
}

type QuestionResponse = { value: string } | { cancelled: true };

export function QuestionRequestPanel({
  request,
  onRespond,
}: {
  request: QuestionRequest;
  onRespond: (request: QuestionRequest, response: QuestionResponse) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswers>(() => initialAnswers(request));
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [minimized, setMinimized] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const answersRef = useRef(answers);
  const onRespondRef = useRef(onRespond);
  const timeoutSettledRef = useRef(false);
  answersRef.current = answers;
  onRespondRef.current = onRespond;

  useEffect(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setQuestionIndex(0);
    setAnswers(initialAnswers(request));
    setSkippedQuestionIds(new Set());
    setMinimized(false);
    timeoutSettledRef.current = false;
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    };
  }, [request]);

  useEffect(() => {
    const expiresAt = request.expiresAt;
    if (!expiresAt) {
      setRemainingSeconds(null);
      return;
    }
    const updateCountdown = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const countdownTimer = setInterval(updateCountdown, 250);
    const responseTimer = setTimeout(() => {
      if (timeoutSettledRef.current) return;
      const fallback = timeoutFallbackAnswers(request, answersRef.current);
      timeoutSettledRef.current = true;
      onRespondRef.current(request, {
        value: serializeQuestionResponse(request, fallback.answers, fallback.timedOutQuestionIds),
      });
    }, Math.max(0, expiresAt - Date.now() - 100));
    return () => {
      clearInterval(countdownTimer);
      clearTimeout(responseTimer);
    };
  }, [request]);

  const question = request.questions[questionIndex];
  const selected = question ? answers.selectedOptions[question.id] ?? [] : [];
  const customAnswer = question ? answers.customAnswers[question.id] ?? "" : "";
  const answeredQuestions = useMemo(
    () => request.questions.map((item) => hasAnswer(item.id, answers) || skippedQuestionIds.has(item.id)),
    [answers, request.questions, skippedQuestionIds],
  );
  const currentAnswered = answeredQuestions[questionIndex] ?? false;
  const canSubmit = answeredQuestions.every(Boolean)
    && request.questions.some((item) => hasAnswer(item.id, answers));
  const isLastQuestion = questionIndex === request.questions.length - 1;

  if (!question) return null;

  const clearScheduledAdvance = () => {
    if (!advanceTimerRef.current) return;
    clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
  };

  const selectOption = (optionIndex: number, autoAdvance = true) => {
    if (autoAdvance && advanceTimerRef.current) return;
    setSkippedQuestionIds((current) => {
      if (!current.has(question.id)) return current;
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
    const currentSelected = answers.selectedOptions[question.id] ?? [];
    const nextSelected = question.multi
      ? currentSelected.includes(optionIndex)
        ? currentSelected.filter((index) => index !== optionIndex)
        : [...currentSelected, optionIndex]
      : [optionIndex];
    const nextAnswers = {
      ...answers,
      selectedOptions: { ...answers.selectedOptions, [question.id]: nextSelected },
    };
    setAnswers(nextAnswers);
    if (!question.multi && autoAdvance) {
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        if (isLastQuestion) submitAnswers(nextAnswers, true);
        else setQuestionIndex((current) => Math.min(current + 1, request.questions.length - 1));
      }, 180);
    }
  };

  const setCustomAnswer = (value: string) => {
    if (value.trim()) {
      setSkippedQuestionIds((current) => {
        if (!current.has(question.id)) return current;
        const next = new Set(current);
        next.delete(question.id);
        return next;
      });
    }
    setAnswers((current) => ({
      ...current,
      customAnswers: { ...current.customAnswers, [question.id]: value },
    }));
  };

  const submitAnswers = (submittedAnswers = answers, allowIncomplete = false) => {
    if (timeoutSettledRef.current || (!allowIncomplete && !canSubmit)) return;
    clearScheduledAdvance();
    timeoutSettledRef.current = true;
    onRespond(request, {
      value: serializeQuestionResponse(request, submittedAnswers),
    });
  };

  const moveQuestion = (nextIndex: number) => {
    clearScheduledAdvance();
    setQuestionIndex(Math.min(Math.max(nextIndex, 0), request.questions.length - 1));
  };

  const moveOption = (direction: -1 | 1) => {
    if (question.options.length === 0) return;
    const currentIndex = selected.at(-1) ?? (direction > 0 ? -1 : 0);
    const nextIndex = (currentIndex + direction + question.options.length) % question.options.length;
    selectOption(nextIndex, false);
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-question-option="${nextIndex}"]`)?.focus();
  };

  const skipQuestion = () => {
    clearScheduledAdvance();
    const nextAnswers = {
      selectedOptions: { ...answers.selectedOptions, [question.id]: [] },
      customAnswers: { ...answers.customAnswers, [question.id]: "" },
    };
    setAnswers(nextAnswers);
    setSkippedQuestionIds((current) => new Set(current).add(question.id));
    if (!isLastQuestion) {
      moveQuestion(questionIndex + 1);
      return;
    }
    const hasEarlierAnswer = request.questions.some((item, index) => (
      index !== questionIndex && hasAnswer(item.id, nextAnswers)
    ));
    if (hasEarlierAnswer) submitAnswers(nextAnswers, true);
    else setMinimized(true);
  };

  const minimizeQuestion = () => {
    clearScheduledAdvance();
    setMinimized(true);
  };

  if (minimized) {
    return (
      <button
        type="button"
        className={styles.minimizedPrompt}
        data-question-request-minimized="true"
        aria-label={t("chat.resumeQuestion")}
        onClick={() => setMinimized(false)}
      >
        <span className={styles.minimizedLabel}><QuestionIcon />{t("chat.question")}</span>
        <span className={styles.minimizedQuestion}>{question.question}</span>
        <span className={styles.minimizedAction}>{t("chat.continue")}</span>
      </button>
    );
  }

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      data-question-request-panel="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          minimizeQuestion();
          return;
        }
        const InputElement = event.currentTarget.ownerDocument.defaultView?.HTMLInputElement;
        if (InputElement && event.target instanceof InputElement) return;
        if (event.key === "ArrowLeft" && request.questions.length > 1) {
          event.preventDefault();
          moveQuestion(questionIndex - 1);
          return;
        }
        if (event.key === "ArrowRight" && request.questions.length > 1) {
          event.preventDefault();
          if (currentAnswered) moveQuestion(questionIndex + 1);
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          moveOption(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const optionIndex = Number(event.key) - 1;
          if (question.options[optionIndex]) {
            event.preventDefault();
            selectOption(optionIndex);
          }
        }
      }}
    >
      <div className={styles.header}>
        <div className={styles.panelLabel}>
          <QuestionIcon />
          <span>{t("chat.question")}</span>
        </div>
        <div className={styles.headerActions}>
          {request.questions.length > 1 && <div className={styles.pagination}>
            <button
              type="button"
              className={styles.paginationButton}
              disabled={questionIndex === 0}
              aria-label={t("chat.previousQuestion")}
              onClick={() => moveQuestion(questionIndex - 1)}
            >
              <QuestionChevron direction="left" />
            </button>
            <span className={styles.paginationCount}>{questionIndex + 1} of {request.questions.length}</span>
            <button
              type="button"
              className={styles.paginationButton}
              disabled={isLastQuestion || !currentAnswered}
              aria-label={t("chat.nextQuestion")}
              onClick={() => moveQuestion(questionIndex + 1)}
            >
              <QuestionChevron direction="right" />
            </button>
          </div>}
          <button type="button" className={styles.closeButton} aria-label={t("chat.minimizeQuestion")} onClick={minimizeQuestion}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <h2 id={titleId} className={styles.question}>{question.question}</h2>

      <div
        className={styles.options}
        role={question.multi ? "group" : "radiogroup"}
        aria-label={question.question}
      >
        {question.options.map((option, optionIndex) => {
          const checked = selected.includes(optionIndex);
          const recommended = question.recommended === optionIndex;
          return (
            <button
              key={`${question.id}:${optionIndex}`}
              type="button"
              role={question.multi ? "checkbox" : "radio"}
              aria-checked={checked}
              data-question-option={optionIndex}
              className={styles.option}
              onClick={() => selectOption(optionIndex)}
            >
              <span
                aria-hidden="true"
                className={styles.optionMark}
                data-multi={question.multi ? "true" : "false"}
                data-selected={checked ? "true" : "false"}
              >
                {checked
                  ? question.multi ? <QuestionCheck /> : <span className={styles.optionDot} />
                  : optionIndex + 1}
              </span>
              <span className={styles.optionContent}>
                <span className={styles.optionTitleRow}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {recommended && <span className={styles.recommended}>{t("chat.recommended")}</span>}
                </span>
                {option.description && <span className={styles.optionDescription}>{option.description}</span>}
                {checked && option.preview && <span className={styles.optionPreview}>{option.preview}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.customRow}>
        <span className={styles.customIcon}><PencilIcon /></span>
        <input
          value={customAnswer}
          className={styles.customInput}
          placeholder={t("chat.writeOwnResponse")}
          aria-label={t("chat.writeOwnResponse")}
          onChange={(event) => setCustomAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            if (!isLastQuestion && currentAnswered) moveQuestion(questionIndex + 1);
            else submitAnswers();
          }}
        />
        <div className={styles.footer}>
          <Button
            className={styles.skipButton}
            size="sm"
            aria-label={remainingSeconds !== null && remainingSeconds <= 20
              ? t("chat.skipCountdown", { seconds: remainingSeconds })
              : undefined}
            onClick={skipQuestion}
          >
            {t("chat.skip")}
            {remainingSeconds !== null && remainingSeconds <= 20
              ? <span className={styles.countdownBadge}>{remainingSeconds}</span>
              : null}
          </Button>
          <Button
            className={styles.submitButton}
            size="sm"
            disabled={isLastQuestion ? !canSubmit : !currentAnswered}
            onClick={() => {
              if (isLastQuestion) submitAnswers();
              else moveQuestion(questionIndex + 1);
            }}
          >
            {isLastQuestion ? t("chat.send") : t("chat.next")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function initialAnswers(request: QuestionRequest): QuestionAnswers {
  const selectedOptions: Record<string, number[]> = {};
  for (const question of request.questions) selectedOptions[question.id] = [];
  return { selectedOptions, customAnswers: {} };
}

function hasAnswer(questionId: string, answers: QuestionAnswers): boolean {
  return (answers.selectedOptions[questionId]?.length ?? 0) > 0
    || (answers.customAnswers[questionId]?.trim().length ?? 0) > 0;
}

function serializeQuestionResponse(
  request: QuestionRequest,
  answers: QuestionAnswers,
  timedOutQuestionIds: ReadonlySet<string> = new Set(),
): string {
  return JSON.stringify({
    kind: "submit",
    results: request.questions.map((item) => ({
      id: item.id,
      question: item.question,
      options: item.options.map((option) => option.label),
      multi: item.multi ?? false,
      selectedOptions: (answers.selectedOptions[item.id] ?? [])
        .map((index) => item.options[index]?.label)
        .filter((option): option is string => option !== undefined),
      ...(answers.customAnswers[item.id]?.trim()
        ? { customInput: answers.customAnswers[item.id].trim() }
        : {}),
      ...(timedOutQuestionIds.has(item.id) ? { timedOut: true } : {}),
    })),
  });
}

function timeoutFallbackAnswers(
  request: QuestionRequest,
  answers: QuestionAnswers,
): { answers: QuestionAnswers; timedOutQuestionIds: Set<string> } {
  const nextAnswers: QuestionAnswers = {
    selectedOptions: { ...answers.selectedOptions },
    customAnswers: { ...answers.customAnswers },
  };
  const timedOutQuestionIds = new Set<string>();
  for (const question of request.questions) {
    if (hasAnswer(question.id, nextAnswers)) continue;
    const fallbackIndex = Math.min(
      Math.max(question.recommended ?? 0, 0),
      Math.max(question.options.length - 1, 0),
    );
    nextAnswers.selectedOptions[question.id] = question.options[fallbackIndex] ? [fallbackIndex] : [];
    timedOutQuestionIds.add(question.id);
  }
  return { answers: nextAnswers, timedOutQuestionIds };
}

function QuestionChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === "left" ? <path d="m8.5 3.5-3.5 3.5 3.5 3.5" /> : <path d="m5.5 3.5 3.5 3.5-3.5 3.5" />}
    </svg>
  );
}

function QuestionCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 5.2 2.1 2L8 2.8" />
    </svg>
  );
}

function QuestionIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="7" /><path d="M6.8 7.2A2.3 2.3 0 0 1 9 5.7c1.3 0 2.3.8 2.3 1.9 0 1.5-1.6 1.8-2.1 2.8M9.1 13h.01" /></svg>;
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m3 3 8 8M11 3l-8 8" /></svg>;
}

function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 10.8.5-2.4 5.8-5.8 2.1 2.1-5.8 5.8zM8.8 3.1l2.1 2.1" /></svg>;
}
