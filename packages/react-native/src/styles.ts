import { StyleSheet } from "react-native";

/**
 * Neutral card styles. Numbers are never color-coded by sentiment.
 * Accent appears only on selection. No dark-pattern motion.
 */
export const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    zIndex: 1000,
    pointerEvents: "box-none",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    maxWidth: 360,
    alignSelf: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  question: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: "#111827",
  },
  dismiss: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
    marginRight: -8,
  },
  dismissText: {
    fontSize: 22,
    lineHeight: 24,
    color: "#6b7280",
  },
  scaleWrap: {
    gap: 8,
  },
  endLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  endLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  scale: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  scaleOptions: {
    flexDirection: "column",
    gap: 8,
    alignSelf: "stretch",
  },
  rating: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  ratingSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  ratingCollapsed: {
    alignSelf: "center",
  },
  ratingText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  ratingTextSelected: {
    color: "#ffffff",
  },
  ratingOption: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "stretch",
  },
  followUp: {
    marginTop: 12,
    gap: 8,
  },
  followUpLabel: {
    fontSize: 14,
    color: "#374151",
  },
  textInput: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: "#111827",
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  btn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: {
    backgroundColor: "transparent",
  },
  btnPrimary: {
    backgroundColor: "#111827",
  },
  btnGhostText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  detractor: {
    marginTop: 12,
    gap: 8,
  },
  detractorText: {
    fontSize: 14,
    color: "#374151",
  },
  thanks: {
    paddingVertical: 8,
  },
  thanksText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    textAlign: "center",
  },
  badge: {
    marginTop: 10,
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
  },
  live: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
