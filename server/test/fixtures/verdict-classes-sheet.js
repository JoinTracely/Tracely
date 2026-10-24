/* The owner's twenty-sentence sheet of 2026-10-24, each sentence with the
 * verdict the check saved for it in his Doc (read from the extension's
 * verdict cache that day: no sentence was looked up) and the class the
 * owner expects. Ten were red: 2, 4, 5, 7, 8, 11, 13, 16, 19 and 20, all
 * "Contradicted — check this fact" but 11 and 20 ("Doesn't make sense").
 * What was wrong with that (classifyFinding in extension/content.js):
 *   - 4 and 8 are true figures with a wrong citation, and came back "false";
 *     12 and 18 are the same pattern and came back "accurate";
 *   - 5 and 16 draw a conclusion their premise does not support, and came
 *     back "false" with an explanation that says exactly that.
 * Not fixed here: 8's estimate (1.28 billion) is WHO's for 2019, and nothing
 * says it needs its year (owner: "do not reject a historical estimate simply
 * because a newer estimate exists"; it was not rejected, only not dated).
 * `expect`: "" for no flag. */
export const VERDICT_SHEET = [
  { n: 1, expect: "", text: "According to the World Health Organization, physical inactivity is associated with an increased risk of cardiovascular disease, type 2 diabetes, and certain cancers (WHO, 2024).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 2, expect: "false", text: "A 2023 scientific investigation demonstrated that the human brain operates at only 10% of its total capacity, with the remaining 90% remaining permanently inactive throughout an individual's lifetime.",
    saved: { verdict: "false", confidence: "high", explanation: "The 10% brain-use claim is a longstanding myth, and no brain region remains permanently inactive in healthy people.", revision: "A 2023 scientific investigation found that the human brain uses widespread neural activity throughout an individual's lifetime." } },
  { n: 3, expect: "", text: "The James Webb Space Telescope primarily observes the universe in infrared wavelengths, allowing astronomers to study distant galaxies and regions obscured by cosmic dust.",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 4, expect: "wrong_source", text: "The International Energy Agency reported that global electric car sales approached 14 million vehicles in 2023, accounting for approximately 18% of all cars sold worldwide (UNESCO, 2023).",
    saved: { verdict: "false", confidence: "high", explanation: "The figures are attributed to the IEA, but the parenthetical incorrectly cites UNESCO (2023).", revision: "The International Energy Agency reported that global electric car sales approached 14 million vehicles in 2023, accounting for approximately 18% of all cars sold worldwide (IEA, 2024)." } },
  { n: 5, expect: "incoherent", text: "Because several studies have identified associations between social media use and adolescent anxiety, eliminating social media access would completely prevent anxiety disorders among teenagers.",
    saved: { verdict: "false", confidence: "high", explanation: "Associations between social media use and anxiety do not establish that removing social media would eliminate all anxiety disorders.", revision: "Because several studies have identified associations between social media use and adolescent anxiety, reducing social media access might help some teenagers but would not prevent all anxiety disorders." } },
  { n: 6, expect: "", text: "According to NASA, sunlight takes approximately eight minutes and twenty seconds to travel from the Sun to Earth (NASA, 2024).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 7, expect: "false", text: "Researchers have conclusively established that drinking exactly two liters of water per day prevents all forms of kidney disease, regardless of age, health status, or environmental conditions.",
    saved: { verdict: "false", confidence: "high", explanation: "Kidney disease has diverse causes, and researchers have not established that exactly two liters of water prevents every form.", revision: "" } },
  { n: 8, expect: "wrong_source", text: "The World Health Organization estimates that approximately 1.28 billion adults aged 30 to 79 worldwide have hypertension (NASA, 2023).",
    saved: { verdict: "false", confidence: "high", explanation: "The claim correctly gives the WHO estimate, but the parenthetical incorrectly attributes it to NASA.", revision: "The World Health Organization estimates that approximately 1.28 billion adults aged 30 to 79 worldwide have hypertension (WHO, 2023)." } },
  { n: 9, expect: "", text: "The process of photosynthesis converts light energy into chemical energy, allowing plants and certain other organisms to produce energy-rich organic compounds.",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 10, expect: "", text: "A 2023 report from the International Energy Agency found that renewable energy capacity additions worldwide increased by almost 50% compared with 2022 (IEA, 2024).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 11, expect: "incoherent", text: "Because students who regularly read books often demonstrate stronger vocabulary skills, requiring every student to read for exactly thirty minutes daily would guarantee substantial improvements in academic achievement.",
    saved: { verdict: "incoherent", confidence: "high", explanation: "The observed association does not support a guarantee about a specific intervention and every student's academic achievement.", revision: "Because students who regularly read books often demonstrate stronger vocabulary skills, requiring daily reading may improve some students' academic outcomes." } },
  { n: 12, expect: "wrong_source", text: "The National Aeronautics and Space Administration reports that Earth's atmosphere consists of approximately 78% nitrogen and 21% oxygen (OECD, 2023).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 13, expect: "false", text: "A 2024 report from the World Health Organization concluded that antibiotics are effective treatments for viral infections such as influenza and the common cold, provided they are administered during the first 48 hours of symptoms.",
    saved: { verdict: "false", confidence: "high", explanation: "Antibiotics are ineffective against influenza and common colds, including when given within the first 48 hours.", revision: "A 2024 report from the World Health Organization concluded that antibiotics are ineffective treatments for viral infections such as influenza and the common cold." } },
  { n: 14, expect: "", text: "The Earth's tectonic plates move gradually over time, contributing to earthquakes, volcanic activity, and the formation of mountain ranges.",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 15, expect: "", text: "The United Nations Environment Programme reported that approximately 1.05 billion tonnes of food waste were generated worldwide in 2022 (UNEP, 2024).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 16, expect: "incoherent", text: "Research has shown that sleep is important for memory consolidation, proving that students who sleep ten hours before an examination will always outperform students who sleep eight hours.",
    saved: { verdict: "false", confidence: "high", explanation: "The evidence does not prove that ten hours of sleep will always produce better examination performance than eight hours.", revision: "Research has shown that sleep is important for memory consolidation, but it does not prove that students who sleep ten hours will always outperform those who sleep eight hours." } },
  { n: 17, expect: "", text: "According to the Centers for Disease Control and Prevention, adults generally need at least seven hours of sleep per night for optimal health (CDC, 2024).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 18, expect: "wrong_source", text: "The International Union for Conservation of Nature identifies habitat loss, overexploitation, invasive species, pollution, and climate change as major threats to biodiversity (OECD, 2023).",
    saved: { verdict: "accurate", confidence: "medium", explanation: "", revision: "" } },
  { n: 19, expect: "false", text: "Scientific measurements have established that carbon dioxide constitutes approximately 21% of Earth's atmosphere, making it the second-most abundant atmospheric gas after nitrogen.",
    saved: { verdict: "false", confidence: "high", explanation: "The sentence confuses carbon dioxide's concentration with oxygen's atmospheric concentration and rank.", revision: "Scientific measurements have established that carbon dioxide constitutes approximately 0.04% of Earth's atmosphere, while oxygen is the second-most abundant atmospheric gas after nitrogen." } },
  { n: 20, expect: "incoherent", text: "Although artificial intelligence can improve efficiency in certain educational tasks, these findings demonstrate that replacing all classroom teachers with AI systems would produce better academic outcomes for every student.",
    saved: { verdict: "incoherent", confidence: "high", explanation: "The universal conclusion does not follow from the limited premise about efficiency in certain educational tasks.", revision: "" } },
];
