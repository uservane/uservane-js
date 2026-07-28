/**
 * Accessible rating scale for React Native.
 * Radio-group semantics via accessibilityRole. Numbers never sentiment-colored.
 */

import { type SurveyType, scaleForType } from "@uservane/browser";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "./styles.js";

export type RatingScaleProps = {
  type: SurveyType;
  endLabels?: { low: string; high: string };
  /** Currently selected value; null before any choice. */
  value: number | null;
  /** When true, only the selected value is shown (post-selection collapse). */
  collapsed?: boolean;
  onSelect: (value: number) => void;
  disabled?: boolean;
};

type ScaleItem = { value: number; label: string; a11yLabel: string };

function buildItems(
  type: SurveyType,
  endLabels?: { low: string; high: string },
): { items: ScaleItem[]; groupLabel: string; isOptions: boolean; low?: string; high?: string } {
  const scale = scaleForType(type);
  const low = endLabels?.low ?? scale.defaultEndLabels?.low;
  const high = endLabels?.high ?? scale.defaultEndLabels?.high;

  if (scale.options && scale.options.length > 0) {
    return {
      items: scale.options.map((o) => ({
        value: o.value,
        label: o.label,
        a11yLabel: o.label,
      })),
      groupLabel: scale.groupLabel,
      isOptions: true,
    };
  }

  const items: ScaleItem[] = [];
  for (let i = scale.min; i <= scale.max; i++) {
    let a11yLabel = String(i);
    if (i === scale.min && low) a11yLabel = `${i}, ${low}`;
    if (i === scale.max && high) a11yLabel = `${i}, ${high}`;
    items.push({ value: i, label: String(i), a11yLabel });
  }
  return {
    items,
    groupLabel: scale.groupLabel,
    isOptions: false,
    low,
    high,
  };
}

export function RatingScale({
  type,
  endLabels,
  value,
  collapsed = false,
  onSelect,
  disabled = false,
}: RatingScaleProps) {
  const { items, groupLabel, isOptions, low, high } = useMemo(
    () => buildItems(type, endLabels),
    [type, endLabels],
  );

  const visibleItems =
    collapsed && value !== null ? items.filter((item) => item.value === value) : items;

  return (
    <View style={styles.scaleWrap} testID={`uv-scale-${type}`}>
      {!isOptions && !collapsed && low && high ? (
        <View style={styles.endLabels}>
          <Text style={styles.endLabel}>{low}</Text>
          <Text style={styles.endLabel}>{high}</Text>
        </View>
      ) : null}

      <View
        style={isOptions ? styles.scaleOptions : styles.scale}
        accessibilityRole="radiogroup"
        accessibilityLabel={groupLabel}
        testID="uv-radiogroup"
      >
        {visibleItems.map((item) => {
          const selected = value === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => {
                if (!disabled) onSelect(item.value);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={item.a11yLabel}
              accessibilityState={{ selected, disabled: Boolean(disabled) }}
              style={[
                isOptions ? styles.ratingOption : styles.rating,
                selected && styles.ratingSelected,
                collapsed && styles.ratingCollapsed,
              ]}
              testID={`uv-rating-${item.value}`}
            >
              <Text style={[styles.ratingText, selected && styles.ratingTextSelected]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
