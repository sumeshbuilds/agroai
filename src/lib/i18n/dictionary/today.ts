/**
 * "Today" board on the crops page and the weekly advisory cards.
 * Pictorial labels are deliberately short: they sit under big emoji tiles.
 */
export const TODAY: Record<string, string> = {
  /* Board header */
  "Do these today": "ଆଜି ଏହି କାମ କରନ୍ତୁ",
  "Tap a job once it is done": "କାମ ସରିଲେ ସେଥିରେ ଟିପନ୍ତୁ",
  "Tap again to undo": "ପୁଣି ଟିପିଲେ ହଟିଯିବ",
  "Today's checklist": "ଆଜିର କାମ ତାଲିକା",
  "Mark {task} as done": "{task} କାମ ସରିଛି ବୋଲି ଚିହ୍ନଟ କରନ୍ତୁ",
  "{done} of {total} done": "{total} ମଧ୍ୟରୁ {done} ସରିଲା",
  "All done for today": "ଆଜିର ସବୁ କାମ ସରିଲା",
  "No jobs today. Walk the field and check the crop once.":
    "ଆଜି କୌଣସି କାମ ନାହିଁ। ଥରେ ଜମିକୁ ବୁଲି ଫସଲ ଦେଖନ୍ତୁ।",
  "How and why": "କେମିତି ଓ କାହିଁକି",
  "Reset": "ପୁନଃ ସେଟ୍",
  "Reset today": "ଆଜିର ତାଲିକା ପୁନଃ ସେଟ୍ କରନ୍ତୁ",
  "Saved on this device. Completing a task twice never adds XP twice.":
    "ଏହା ଏହି ଫୋନରେ ସେଭ୍ ହୁଏ। ଏକ କାମ ଦୁଇଥର କଲେ ମଧ୍ୟ XP ଦୁଇଥର ମିଳେ ନାହିଁ।",

  /* Verdict */
  "Good day to work": "କାମ ପାଇଁ ଭଲ ଦିନ",
  "Work with care": "ସାବଧାନରେ କାମ କରନ୍ତୁ",
  "Better to wait today": "ଆଜି ଅପେକ୍ଷା କରିବା ଭଲ",
  "Reading the weather...": "ପାଣିପାଗ ପଢ଼ୁଛି...",
  "No forecast yet": "ପାଣିପାଗ ତଥ୍ୟ ଏବେ ନାହିଁ",
  "Weather service is not reachable right now.":
    "ପାଣିପାଗ ସେବା ଏବେ ଉପଲବ୍ଧ ନାହିଁ।",
  "Go": "ଯାଆନ୍ତୁ",
  "Care": "ସାବଧାନ",
  "Wait": "ଅପେକ୍ଷା",
  "This week": "ଏହି ସପ୍ତାହ",
  "{good} of {days} workable": "{days} ଦିନରୁ {good} ଦିନ କାମ ପାଇଁ ଠିକ୍",
  "estimate from the 7-day forecast": "୭ ଦିନର ପାଣିପାଗ ଆକଳନ",
  "No pest report": "କୀଟ ରିପୋର୍ଟ ନାହିଁ",

  /* Picture tiles */
  "Watering": "ପାଣି ଦେବା",
  "Pest watch": "କୀଟ ନଜର",
  "Rain may water the field": "ବର୍ଷା ହେଲେ ଜମିକୁ ପାଣି ମିଳିବ",
  "No soil reading": "ମାଟି ଆର୍ଦ୍ରତା ତଥ୍ୟ ନାହିଁ",
  "Soil is dry — water": "ମାଟି ଶୁଖିଛି — ପାଣି ଦିଅନ୍ତୁ",
  "Water is fine today": "ଆଜି ପାଣି ଠିକ୍ ଅଛି",
  "No watering needed": "ପାଣି ଦେବା ଦରକାର ନାହିଁ",
  "Topsoil {percent}%": "ଉପର ମାଟି {percent}%",
  "No pest alert": "କୀଟ ସତର୍କତା ନାହିଁ",
  "Pest alert: {pest}": "କୀଟ ସତର୍କତା: {pest}",
  "Watch {pest}": "{pest} ଉପରେ ନଜର ରଖନ୍ତୁ",
  "Checking pests...": "କୀଟ ଯାଞ୍ଚ ହେଉଛି...",
  "Not a spray order": "ଏହା ସ୍ପ୍ରେ ନିର୍ଦ୍ଦେଶ ନୁହେଁ",
  "Pest risk: {level}": "କୀଟ ବିପଦ: {level}",

  /* Task titles from the daily engine */
  "Inspect {pest} hotspots today": "ଆଜି {pest} ପ୍ରଭାବିତ ସ୍ଥାନ ଦେଖନ୍ତୁ",
  "Water": "ପାଣି",
  "Nutrition": "ପୋଷଣ",
  "Field work": "ଜମି କାମ",
  "Harvest": "ଅମଳ",
  "Monitor": "ନଜର",
  "Soil": "ମାଟି",
  "Safety": "ସୁରକ୍ଷା",
  "Do today": "ଆଜି କରନ୍ତୁ",
  "Important": "ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ",
  "Routine": "ନିୟମିତ",
  "Optional": "ଇଚ୍ଛାଧୀନ",
  "At sunrise": "ସୂର୍ଯ୍ୟୋଦୟରେ",
  "Morning": "ସକାଳ",
  "Before rain": "ବର୍ଷା ପୂର୍ବରୁ",
  "Midday": "ମଧ୍ୟାହ୍ନ",
  "Evening": "ସନ୍ଧ୍ୟା",
  "Any time": "ଯେକୌଣସି ସମୟ",
  "Scan a leaf": "ପତ୍ର ସ୍କାନ୍ କରନ୍ତୁ",
  "Scan and confirm": "ସ୍କାନ୍ କରି ନିଶ୍ଚିତ କରନ୍ତୁ",
  "Open field drains before the rain": "ବର୍ଷା ପୂର୍ବରୁ ଜମିର ନାଳ ଖୋଲନ୍ତୁ",
  "Check low patches and clear channels so water does not stand around the roots.":
    "ନୀଚା ସ୍ଥାନ ଦେଖନ୍ତୁ ଓ ନାଳ ସଫା କରନ୍ତୁ, ଯାହା ଫେର ଚାରିପାଖେ ପାଣି ନ ରହିବ।",
  "Do not spray before the rain": "ବର୍ଷା ପୂର୍ବରୁ ସ୍ପ୍ରେ କରନ୍ତୁ ନାହିଁ",
  "Rain will wash the spray off and waste money. Re-plan for the calm window after it passes.":
    "ବର୍ଷା ସ୍ପ୍ରେ ଧୋଇ ଦେବ ଓ ଟଙ୍କା ନଷ୍ଟ ହେବ। ବର୍ଷା ପରେ ଶାନ୍ତ ସମୟରେ ସ୍ପ୍ରେ କରନ୍ତୁ।",
  "Rain forecast within 48 hours": "୪୮ ଘଣ୍ଟା ଭିତରେ ବର୍ଷା ହେବ",
  "Irrigate the driest block early": "ସବୁଠାରୁ ଶୁଖିଲା ଅଂଶକୁ ସକାଳେ ପାଣି ଦିଅନ୍ତୁ",
  "Water before 9 am so less is lost to evaporation.":
    "ସକାଳ ୯ଟା ପୂର୍ବରୁ ପାଣି ଦିଅନ୍ତୁ, ଯାହା କମ୍ ବାଷ୍ପ ହେବ।",
  "Water the lightest soil first.": "ହାଲୁକା ମାଟିକୁ ପ୍ରଥମେ ପାଣି ଦିଅନ୍ତୁ।",
  "Low surface moisture": "ଉପର ମାଟିରେ ଆର୍ଦ୍ରତା କମ୍",
  "Protect the crop from the afternoon heat":
    "ଅପରାହ୍ନ ଗରମରୁ ଫସଲକୁ ରକ୍ଷା କରନ୍ତୁ",
  "Mulch exposed soil, irrigate before 10 am and avoid moving plants at midday.":
    "ଖୋଲା ମାଟିରେ ଘାସ ପତ୍ର ଢାଙ୍କନ୍ତୁ, ୧୦ଟା ପୂର୍ବରୁ ପାଣି ଦିଅନ୍ତୁ ଓ ମଧ୍ୟାହ୍ନରେ ଗଛ ଘୁଞ୍ଚାନ୍ତୁ ନାହିଁ।",
  "Scout the lower leaves for spots": "ତଳ ପତ୍ରରେ ଦାଗ ଅଛି କି ଦେଖନ୍ତୁ",
  "Long leaf-wetness periods favour fungal disease. Check 10 plants and photograph any lesion.":
    "ପତ୍ର ଦୀର୍ଘ ସମୟ ଓଦା ରହିଲେ ଫଙ୍ଗସ୍ ରୋଗ ବଢ଼େ। ୧୦ଟି ଗଛ ଦେଖି ଦାଗର ଫଟୋ ନିଅନ୍ତୁ।",
  "Some humid hours are forecast. Check leaf undersides and remove badly affected leaves.":
    "କିଛି ସମୟ ଓଦା ରହିବ। ପତ୍ରର ତଳ ପଟ ଦେଖି ଅଧିକ ଖରାପ ପତ୍ର କାଢ଼ି ଦିଅନ୍ତୁ।",
  "Humid canopy conditions": "ଓଦା ପାଗ",
  "Use the calm spray window": "ଶାନ୍ତ ସମୟରେ ସ୍ପ୍ରେ କରନ୍ତୁ",
  "Follow the label dose and wear protective clothing.":
    "ବୋତଲରେ ଲେଖା ଡୋଜ୍ ନିଅନ୍ତୁ ଓ ମୁହଁ ଢାଙ୍କି କାମ କରନ୍ତୁ।",
  "Check maturity and plan the harvest":
    "ପାଚିବା ଯାଞ୍ଚ କରି ଅମଳର ଯୋଜନା କରନ୍ତୁ",
  "Test grain or fruit maturity, arrange labour and prepare a clean drying floor before the weather turns.":
    "ଦାନା କିମ୍ବା ଫଳ ପାଚିଛି କି ଦେଖନ୍ତୁ, ଶ୍ରମିକ ଠିକ୍ କରନ୍ତୁ ଓ ପାଗ ବିଗିଡ଼ିବା ପୂର୍ବରୁ ସଫା ଶୁଖାଇବା ସ୍ଥାନ ତିଆରି କରନ୍ତୁ।",
  "The crop is in its harvest window": "ଫସଲ ଅମଳ ସମୟରେ ଅଛି",
  "Walk a diagonal path and check the underside of leaves on 10 plants.":
    "ଜମିରେ ଏକ କୋଣରୁ ଅନ୍ୟ କୋଣକୁ ଯାଇ ୧୦ଟି ଗଛର ପତ୍ର ତଳ ଦେଖନ୍ତୁ।",
  "Nothing urgent today. Keep the routine scouting walk.":
    "ଆଜି କିଛି ଜରୁରୀ ନାହିଁ। ନିୟମିତ ପରି ଜମି ବୁଲି ଦେଖନ୍ତୁ।",
  "A light day in the field": "ଆଜି ଜମିରେ ହାଲୁକା ଦିନ",
  "Consecutive fully-completed days": "ପରସ୍ପର ପରେ ସମ୍ପୂର୍ଣ୍ଣ କାମ ସରିଥିବା ଦିନ",
  "{count}-day streak": "{count} ଦିନର ଧାରା",
  "{xp} XP": "{xp} XP",
  "{count} task(s) need attention today": "ଆଜି {count} କାମ ଉପରେ ଧ୍ୟାନ ଦିଅନ୍ତୁ",
  "field work": "ଜମି କାମ",
  "day {day}": "ଦିନ {day}",
  "{crop} · {stage}": "{crop} · {stage}",

  /* Weekly advisory cards */
  "Weekly action plan": "ସାପ୍ତାହିକ କାର୍ଯ୍ୟ ଯୋଜନା",
  "{crop} — weekly action plan": "{crop} — ସାପ୍ତାହିକ କାର୍ଯ୍ୟ ଯୋଜନା",
  "Irrigation": "ପାଣି ଦେବା",
  "Fertilizer & Spraying": "ସାର ଓ ସ୍ପ୍ରେ",
  "Pest & Disease Watch": "କୀଟ ଓ ରୋଗ ନଜର",
  "Best Field-Work Days": "ଜମି କାମ ପାଇଁ ଭଲ ଦିନ",
  "Next Step": "ପରବର୍ତ୍ତୀ ପାଦ",
  "Say it in Odia": "ଓଡ଼ିଆରେ ପଢ଼ନ୍ତୁ",
  "Read in English": "ଇଂରାଜୀରେ ପଢ଼ନ୍ତୁ",
  "Generated {time}": "{time} ରେ ତିଆରି",
  "Gemini · {model}": "Gemini · {model}",
  "Rule-based fallback": "ନିୟମ ଆଧାରିତ ଉତ୍ତର",
  "Odia version is available for this plan.": "ଏହି ଯୋଜନାର ଓଡ଼ିଆ ସଂସ୍କରଣ ଅଛି।",
  "Refresh this plan": "ଏହି ଯୋଜନା ନୂଆ କରନ୍ତୁ",
  "Generate weekly advisory": "ସାପ୍ତାହିକ ପରାମର୍ଶ ତିଆରି କରନ୍ତୁ",
  "Writing...": "ଲେଖୁଛି...",
};
