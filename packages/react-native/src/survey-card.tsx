/**
 * React Native survey card. One question + optional follow-up + honest thanks.
 * Honors reduced-motion via AccessibilityInfo. No dark patterns.
 */

import {
  COPY,
  isLowScoreFollowUp,
  type SurveyDefinition,
  THANKS_AUTO_DISMISS_MS,
} from "@uservane/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, TextInput, View } from "react-native";
import { RatingScale } from "./rating.js";
import { styles } from "./styles.js";
import type { SurveyCompleteResult } from "./types.js";

export type SurveyPhase = "question" | "follow-up" | "submitting" | "thanks";

export type SurveyCardProps = {
  survey: SurveyDefinition;
  onComplete: (result: SurveyCompleteResult) => void;
  onDismiss: () => void;
  /** Called after thanks auto-dismiss (or immediately under reduced-motion). */
  onHide?: () => void;
  /** Test override for reduced motion (avoids async AccessibilityInfo race). */
  reducedMotionOverride?: boolean;
  /** Test override for thanks auto-dismiss duration. */
  thanksDismissMs?: number;
};

export function SurveyCard({
  survey,
  onComplete,
  onDismiss,
  onHide,
  reducedMotionOverride,
  thanksDismissMs = THANKS_AUTO_DISMISS_MS,
}: SurveyCardProps) {
  const [phase, setPhase] = useState<SurveyPhase>("question");
  const [rating, setRating] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [followUpRequested, setFollowUpRequested] = useState<boolean | undefined>(undefined);
  const [reducedMotion, setReducedMotion] = useState(reducedMotionOverride ?? false);
  const [liveMessage, setLiveMessage] = useState<string>(COPY.liveRegionQuestion);
  const completedRef = useRef(false);
  const thanksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof reducedMotionOverride === "boolean") {
      setReducedMotion(reducedMotionOverride);
      return;
    }
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReducedMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReducedMotion(enabled);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [reducedMotionOverride]);

  useEffect(() => {
    return () => {
      if (thanksTimer.current) clearTimeout(thanksTimer.current);
    };
  }, []);

  const showThanksThenHide = useCallback(() => {
    setPhase("thanks");
    setLiveMessage(COPY.liveRegionThanks);
    const delay = reducedMotion ? 0 : thanksDismissMs;
    thanksTimer.current = setTimeout(() => {
      onHide?.();
    }, delay);
  }, [reducedMotion, thanksDismissMs, onHide]);

  const finish = useCallback(
    (result: SurveyCompleteResult) => {
      if (completedRef.current) return;
      completedRef.current = true;
      setPhase("submitting");
      onComplete(result);
      showThanksThenHide();
    },
    [onComplete, showThanksThenHide],
  );

  const submitWith = useCallback(
    (opts: { followUpRequested?: boolean } = {}) => {
      if (rating === null) return;
      const trimmed = text.trim();
      finish({
        rating,
        text: trimmed.length > 0 ? trimmed : undefined,
        followUpRequested: opts.followUpRequested ?? followUpRequested,
      });
    },
    [rating, text, followUpRequested, finish],
  );

  const onSelect = useCallback(
    (value: number) => {
      if (phase !== "question" && phase !== "follow-up") return;
      setRating(value);
      setCollapsed(true);

      const hasFollowUp = Boolean(survey.followUpQuestion);
      const wantsFollowUpPath = isLowScoreFollowUp(survey.type, value);

      if (hasFollowUp) {
        setPhase("follow-up");
        setLiveMessage(COPY.liveRegionFollowUp);
        return;
      }

      if (wantsFollowUpPath) {
        setPhase("follow-up");
        setLiveMessage(COPY.followUpOffer);
        return;
      }

      // Rating alone is a complete response when no follow-up question.
      finish({ rating: value });
    },
    [phase, survey.followUpQuestion, survey.type, finish],
  );

  if (phase === "thanks") {
    return (
      <View style={styles.overlay} testID="uv-survey-overlay" pointerEvents="box-none">
        <View
          style={styles.card}
          accessibilityRole="text"
          accessibilityLabel={COPY.thanks}
          testID="uv-survey-card"
        >
          <View style={styles.thanks} testID="uv-thanks">
            <Text style={styles.thanksText}>{COPY.thanks}</Text>
          </View>
          <Text style={styles.live} accessibilityLiveRegion="polite">
            {liveMessage}
          </Text>
        </View>
      </View>
    );
  }

  const showFollowUp = phase === "follow-up" && Boolean(survey.followUpQuestion);
  const showDetractor =
    phase === "follow-up" && rating !== null && isLowScoreFollowUp(survey.type, rating);

  return (
    <View style={styles.overlay} testID="uv-survey-overlay" pointerEvents="box-none">
      <View style={styles.card} accessibilityLabel={survey.question} testID="uv-survey-card">
        <View style={styles.header}>
          <Text style={styles.question} testID="uv-question">
            {survey.question}
          </Text>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={COPY.dismiss}
            style={styles.dismiss}
            testID="uv-dismiss"
          >
            <Text style={styles.dismissText}>{"\u00d7"}</Text>
          </Pressable>
        </View>

        <RatingScale
          type={survey.type}
          endLabels={survey.endLabels}
          value={rating}
          collapsed={collapsed}
          onSelect={onSelect}
          disabled={phase === "submitting"}
        />

        {showFollowUp ? (
          <View style={styles.followUp} testID="uv-follow-up">
            <Text style={styles.followUpLabel}>{survey.followUpQuestion}</Text>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              accessibilityLabel={survey.followUpQuestion ?? "Optional follow-up"}
              testID="uv-follow-up-input"
            />
            <View style={styles.actions}>
              <Pressable
                onPress={() => submitWith()}
                accessibilityRole="button"
                accessibilityLabel={COPY.skip}
                style={[styles.btn, styles.btnGhost]}
                testID="uv-skip"
              >
                <Text style={styles.btnGhostText}>{COPY.skip}</Text>
              </Pressable>
              <Pressable
                onPress={() => submitWith()}
                accessibilityRole="button"
                accessibilityLabel={COPY.submit}
                style={[styles.btn, styles.btnPrimary]}
                testID="uv-submit"
              >
                <Text style={styles.btnPrimaryText}>{COPY.submit}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showDetractor ? (
          <View style={styles.detractor} testID="uv-detractor">
            <Text style={styles.detractorText}>{COPY.followUpOffer}</Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  setFollowUpRequested(false);
                  submitWith({ followUpRequested: false });
                }}
                accessibilityRole="button"
                accessibilityLabel={COPY.followUpNo}
                style={[styles.btn, styles.btnGhost]}
                testID="uv-follow-up-no"
              >
                <Text style={styles.btnGhostText}>{COPY.followUpNo}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFollowUpRequested(true);
                  submitWith({ followUpRequested: true });
                }}
                accessibilityRole="button"
                accessibilityLabel={COPY.followUpYes}
                style={[styles.btn, styles.btnPrimary]}
                testID="uv-follow-up-yes"
              >
                <Text style={styles.btnPrimaryText}>{COPY.followUpYes}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {survey.showBadge ? <Text style={styles.badge}>{COPY.poweredBy}</Text> : null}

        <Text style={styles.live} accessibilityLiveRegion="polite" testID="uv-live">
          {liveMessage}
        </Text>
      </View>
    </View>
  );
}
