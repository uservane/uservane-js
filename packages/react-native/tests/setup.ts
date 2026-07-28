/**
 * Lightweight React Native mock for Vitest (jsdom).
 * Maps RN primitives to DOM elements so @testing-library/react works.
 */
import React from "react";
import { vi } from "vitest";

type AnyProps = Record<string, unknown> & {
  children?: React.ReactNode;
  onPress?: (e: unknown) => void;
  onChangeText?: (text: string) => void;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  testID?: string;
  style?: unknown;
  value?: string;
  editable?: boolean;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityLiveRegion?: string;
};

function passthrough(
  tag: string,
  map: (props: AnyProps) => Record<string, unknown> = (p) => p,
): React.FC<AnyProps> {
  return function RNMock(props: AnyProps) {
    const { children, ...rest } = props;
    const mapped = map(rest);
    return React.createElement(tag, mapped, children);
  };
}

const reduceMotionListeners = new Set<(value: boolean) => void>();
let reduceMotionEnabled = false;

export function __setReduceMotionForTests(value: boolean): void {
  reduceMotionEnabled = value;
  for (const cb of reduceMotionListeners) cb(value);
}

export function __resetReduceMotionForTests(): void {
  reduceMotionEnabled = false;
  reduceMotionListeners.clear();
}

vi.mock("react-native", () => {
  const View = passthrough("div", (p) => {
    const {
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      accessibilityLiveRegion,
      testID,
      style,
      ...rest
    } = p;
    return {
      ...rest,
      role: accessibilityRole,
      "aria-label": accessibilityLabel,
      "aria-checked": accessibilityState?.selected,
      "aria-disabled": accessibilityState?.disabled,
      "aria-live": accessibilityLiveRegion,
      "data-testid": testID,
      "data-style": style ? "styled" : undefined,
    };
  });

  const Text = passthrough("span", (p) => {
    const { accessibilityLabel, testID, style, ...rest } = p;
    return {
      ...rest,
      "aria-label": accessibilityLabel,
      "data-testid": testID,
    };
  });

  const Pressable: React.FC<AnyProps> = (props) => {
    const {
      children,
      onPress,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      testID,
      style,
      ...rest
    } = props;
    const content =
      typeof children === "function" ? (children as (s: object) => React.ReactNode)({}) : children;
    return React.createElement(
      "button",
      {
        ...rest,
        type: "button",
        onClick: onPress,
        role: accessibilityRole ?? "button",
        "aria-label": accessibilityLabel,
        "aria-checked": accessibilityState?.selected,
        "aria-disabled": accessibilityState?.disabled,
        "data-testid": testID,
        "data-selected": accessibilityState?.selected ? "true" : "false",
      },
      content,
    );
  };

  const TextInput: React.FC<AnyProps> = (props) => {
    const { onChangeText, value, testID, accessibilityLabel, maxLength, placeholder, ...rest } =
      props;
    return React.createElement("textarea", {
      ...rest,
      value: value ?? "",
      "data-testid": testID,
      "aria-label": accessibilityLabel,
      maxLength,
      placeholder,
      onChange: (e: { target: { value: string } }) => {
        onChangeText?.(e.target.value);
      },
    });
  };

  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    absoluteFillObject: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  };

  const AccessibilityInfo = {
    isReduceMotionEnabled: async () => reduceMotionEnabled,
    addEventListener: (_event: string, handler: (value: boolean) => void) => {
      reduceMotionListeners.add(handler);
      return {
        remove: () => {
          reduceMotionListeners.delete(handler);
        },
      };
    },
  };

  return {
    View,
    Text,
    Pressable,
    TextInput,
    StyleSheet,
    AccessibilityInfo,
    Platform: { OS: "ios", select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
  };
});
