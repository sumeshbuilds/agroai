/** Pest-risk engine content: levels, threats, reasons and scout actions. */
export const PEST: Record<string, string> = {
  "low": "କମ୍",
  "moderate": "ମଧ୍ୟମ",
  "high": "ଅଧିକ",
  "critical": "ଗୁରୁତର",

  /* Level meta */
  "Low risk": "କମ୍ ସଙ୍କଟ",
  "Conditions do not favour a pest outbreak right now. Keep doing routine scouting.":
    "ବର୍ତ୍ତମାନ ପରିସ୍ଥିତି ପୋକ ବ୍ୟାପିବା ପାଇଁ ଅନୁକୂଳ ନୁହେଁ। ସାଧାରଣ ନଜର ଜାରି ରଖନ୍ତୁ।",
  "Watch closely": "ନିକଟରୁ ନଜର ରଖନ୍ତୁ",
  "Some conditions are turning favourable. Scout the crop every 2–3 days.":
    "କିଛି ପରିସ୍ଥିତି ଅନୁକୂଳ ହେଉଛି। ପ୍ରତି 2–3 ଦିନରେ ଫସଲ ଯାଞ୍ଚ କରନ୍ତୁ।",
  "High risk": "ଅଧିକ ସଙ୍କଟ",
  "Pest pressure is likely. Inspect today and act on the first sign of damage.":
    "ପୋକ ଚାପ ହେବାର ସମ୍ଭାବନା। ଆଜି ଯାଞ୍ଚ କରନ୍ତୁ ଓ ପ୍ରଥମ କ୍ଷତି ଚିହ୍ନରେ ପଦକ୍ଷେପ ନିଅନ୍ତୁ।",
  "Critical risk": "ଗୁରୁତର ସଙ୍କଟ",
  "Weather and crop stage strongly favour an outbreak. Inspect immediately.":
    "ପାଣିପାଗ ଓ ଫସଲ ଅବସ୍ଥା ବ୍ୟାପିବା ପାଇଁ ଅତି ଅନୁକୂଳ। ତୁରନ୍ତ ଯାଞ୍ଚ କରନ୍ତୁ।",

  /* Threat names */
  "Brown planthopper": "ବାଦାମୀ ପ୍ଲାଣ୍ଟହପର",
  "Stem borer": "କାଣ୍ଡ ଛିଦ୍ରକାରୀ",
  "Rice blast": "ଧାନ ବ୍ଲାଷ୍ଟ",
  "Yellow rust": "ହଳଦିଆ ରଷ୍ଟ",
  "Aphids": "ଜିଆଁ",
  "Powdery mildew": "ପାଉଡରୀ ମିଲଡିଉ",
  "Fall armyworm": "ଫଲ୍ ଆର୍ମିୱର୍ମ",
  "Leaf blight": "ପତ୍ର ଝାଉଁଳା",
  "Fruit borer": "ଫଳ ଛିଦ୍ରକାରୀ",
  "Whitefly": "ଧଳା ମାଛି",
  "Early blight": "ଆଗାମୀ ଝାଉଁଳା",
  "Pink bollworm": "ଗୋଲାପୀ ବଲୱର୍ମ",
  "Jassids": "ଜାସିଡ୍",
  "Thrips": "ଥ୍ରିପ୍ସ",
  "Purple blotch": "ବାଇଗଣୀ ଦାଗ",
  "Late blight": "ବିଳମ୍ବିତ ଝାଉଁଳା",
  "Aphids & sucking pests": "ଜିଆଁ ଓ ରସ ଶୋଷକ ପୋକ",
  "Fungal leaf spot": "ପତ୍ର ଫଙ୍ଗସ୍ ଦାଗ",
  "Cutworm / soil pests": "କଟୱର୍ମ / ମାଟି ପୋକ",

  /* Threat reasons */
  "Continuous humid, warm weather and a flooded canopy favour planthopper build-up.":
    "ଲଗାତାର ଆର୍ଦ୍ର, ଉଷ୍ମ ପାଣିପାଗ ଓ ଜଳମଗ୍ନ ଫସଲ ପ୍ଲାଣ୍ଟହପର ବୃଦ୍ଧି ପାଇଁ ଅନୁକୂଳ।",
  "Young tillers are the most vulnerable stage for stem borer dead-hearts.":
    "ଛୋଟ ଶାଖା କାଣ୍ଡ ଛିଦ୍ରକାରୀର ମୃତ କଳି ପାଇଁ ସବୁଠାରୁ ସଙ୍କଟପ୍ରବଣ ଅବସ୍ଥା।",
  "Warm, humid nights with leaf wetness favour blast lesions.":
    "ଉଷ୍ମ, ଆର୍ଦ୍ର ରାତି ଓ ପତ୍ରରେ ଓଦା ରହିବା ବ୍ଲାଷ୍ଟ ଦାଗ ପାଇଁ ଅନୁକୂଳ।",
  "Cool, moist weather is ideal for yellow-rust pustules.":
    "ଥଣ୍ଡା, ଆର୍ଦ୍ର ପାଣିପାଗ ହଳଦିଆ ରଷ୍ଟ ଦାଗ ପାଇଁ ଆଦର୍ଶ।",
  "Dry, warming conditions let aphid colonies multiply on ears and leaves.":
    "ଶୁଖିଲା ଓ ଉଷ୍ମ ପରିସ୍ଥିତି ଶୀଷ ଓ ପତ୍ରରେ ଜିଆଁ ଗୋଷ୍ଠୀ ବଢ଼ାଏ।",
  "Humid, mild conditions support powdery mildew on dense canopies.":
    "ଆର୍ଦ୍ର, ମଧ୍ୟମ ପରିସ୍ଥିତି ଘନ ପତ୍ର ଉପରେ ପାଉଡରୀ ମିଲଡିଉ ବଢ଼ାଏ।",
  "Whorl-stage maize is the preferred feeding window for fall armyworm.":
    "ପତ୍ର କୁଣ୍ଡଳୀ ଅବସ୍ଥାର ମକା ଫଲ୍ ଆର୍ମିୱର୍ମର ପ୍ରିୟ ଖାଦ୍ୟ ସମୟ।",
  "Armyworm can still enter cobs and late whorls before harvest.":
    "ଅମଳ ପୂର୍ବରୁ ଆର୍ମିୱର୍ମ ଭୁଟ୍ଟା ଓ ବିଳମ୍ବିତ ପତ୍ର କୁଣ୍ଡଳୀରେ ପ୍ରବେଶ କରିପାରେ।",
  "Warm weather speeds up stem-borer development in the stem.":
    "ଉଷ୍ମ ପାଣିପାଗ କାଣ୍ଡ ଭିତରେ କାଣ୍ଡ ଛିଦ୍ରକାରୀର ବିକାଶ ବଢ଼ାଏ।",
  "Long leaf-wetness periods favour leaf-blight lesions.":
    "ଦୀର୍ଘ ସମୟ ପତ୍ର ଓଦା ରହିବା ପତ୍ର ଝାଉଁଳା ଦାଗ ପାଇଁ ଅନୁକୂଳ।",
  "Flowering and young fruit are when borers lay eggs on the calyx.":
    "ଫୁଲ ଓ ଛୋଟ ଫଳ ସମୟରେ ଛିଦ୍ରକାରୀ କାଲିକ୍ସ ଉପରେ ଅଣ୍ଡା ଦିଏ।",
  "Dry, warm foliage favours whitefly and the viruses they carry.":
    "ଶୁଖିଲା, ଉଷ୍ମ ପତ୍ର ଧଳା ମାଛି ଓ ସେମାନେ ବହନ କରୁଥିବା ଭୂତାଣୁ ପାଇଁ ଅନୁକୂଳ।",
  "Rain splash and humid foliage spread early-blight spores.":
    "ବର୍ଷାର ଛିଟା ଓ ଆର୍ଦ୍ର ପତ୍ର ଆଗାମୀ ଝାଉଁଳାର ବୀଜାଣୁ ବ୍ୟାପାଏ।",
  "Squares and developing bolls are the entry points for bollworm.":
    "କଢ଼ି ଓ ବଢ଼ୁଥିବା ବଲ୍ ବଲୱର୍ମର ପ୍ରବେଶ ସ୍ଥାନ।",
  "Hot, dry spells favour whitefly populations and sticky lint.":
    "ଅଧିକ ଉତ୍ତାପ ଓ ଶୁଖିଲା ସମୟ ଧଳା ମାଛି ଓ ଚିପଚିପା କପା ପାଇଁ ଅନୁକୂଳ।",
  "Warm weather supports jassid nymphs on the leaf underside.":
    "ଉଷ୍ମ ପାଣିପାଗ ପତ୍ରର ତଳ ପାଖରେ ଜାସିଡ୍ ନିମ୍ଫ ବଢ଼ାଏ।",
  "Dry, warm leaf whorls are ideal for thrips feeding and silvering.":
    "ଶୁଖିଲା, ଉଷ୍ମ ପତ୍ର କୁଣ୍ଡଳୀ ଥ୍ରିପ୍ସର ଖାଦ୍ୟ ଓ ରୁପାଳୀ ପାଇଁ ଆଦର୍ଶ।",
  "Humid foliage after rain favours purple-blotch lesions.":
    "ବର୍ଷା ପରେ ଆର୍ଦ୍ର ପତ୍ର ବାଇଗଣୀ ଦାଗ ପାଇଁ ଅନୁକୂଳ।",
  "Cool, wet nights are the classic late-blight trigger.":
    "ଥଣ୍ଡା, ଓଦା ରାତି ବିଳମ୍ବିତ ଝାଉଁଳାର ପାରମ୍ପରିକ କାରଣ।",
  "Dry warmth builds aphid colonies that also spread virus.":
    "ଶୁଖିଲା ଉଷ୍ମତା ଜିଆଁ ଗୋଷ୍ଠୀ ବଢ଼ାଏ, ଯାହା ଭୂତାଣୁ ମଧ୍ୟ ବ୍ୟାପାଏ।",
  "Dry, warm conditions favour aphids, thrips and mites.":
    "ଶୁଖିଲା, ଉଷ୍ମ ପରିସ୍ଥିତି ଜିଆଁ, ଥ୍ରିପ୍ସ ଓ ମାଇଟ୍ ପାଇଁ ଅନୁକୂଳ।",
  "Wet leaves and high humidity favour fungal leaf spots.":
    "ଓଦା ପତ୍ର ଓ ଅଧିକ ଆର୍ଦ୍ରତା ପତ୍ର ଫଙ୍ଗସ୍ ଦାଗ ପାଇଁ ଅନୁକୂଳ।",
  "Young seedlings are vulnerable to cutworm damage at the base.":
    "ଛୋଟ ଚାରା ମୂଳରେ କଟୱର୍ମ କ୍ଷତି ପାଇଁ ସଙ୍କଟପ୍ରବଣ।",
  "Routine scouting is still worthwhile even though conditions are calm.":
    "ପରିସ୍ଥିତି ଶାନ୍ତ ଥିଲେ ମଧ୍ୟ ସାଧାରଣ ନଜର ରଖିବା ଉପଯୋଗୀ।",

  "Soil is dry": "ମାଟି ଶୁଖିଲା",

  /* Scout actions */
  "Walk the field in the early morning and inspect {threat} hot-spots first.":
    "ସକାଳେ ଜମି ବୁଲି ପ୍ରଥମେ {threat} ପ୍ରଭାବିତ ସ୍ଥାନ ଯାଞ୍ଚ କରନ୍ତୁ।",
  "Do not spray before rain — check the field drainage and remove infected leaves instead.":
    "ବର୍ଷା ପୂର୍ବରୁ ସ୍ପ୍ରେ କରନ୍ତୁ ନାହିଁ — ଜମିର ନିଷ୍କାସନ ଯାଞ୍ଚ କରନ୍ତୁ ଓ ରୋଗାକ୍ରାନ୍ତ ପତ୍ର କାଢ଼ନ୍ତୁ।",
  "Check leaf undersides for mites and thrips; a light irrigation and mulch reduce stress.":
    "ପତ୍ରର ତଳ ପାଖରେ ମାଇଟ୍ ଓ ଥ୍ରିପ୍ସ ଯାଞ୍ଚ କରନ୍ତୁ; ହାଲୁକା ଜଳସେଚନ ଓ ମଲ୍ଚ୍ ଚାପ କମାଏ।",
  "If you must spray, use the calm early-morning window and follow the label dose.":
    "ସ୍ପ୍ରେ କରିବାକୁ ହେଲେ ଶାନ୍ତ ସକାଳ ସମୟ ବ୍ୟବହାର କରନ୍ତୁ ଓ ଲେବଲ୍ ମାତ୍ରା ଅନୁସରଣ କରନ୍ତୁ।",
  "Act today: spot-treat only affected patches and re-check the same spots after 3 days.":
    "ଆଜି ପଦକ୍ଷେପ ନିଅନ୍ତୁ: କେବଳ ପ୍ରଭାବିତ ସ୍ଥାନରେ ଚିକିତ୍ସା କରନ୍ତୁ ଓ 3 ଦିନ ପରେ ସେହି ସ୍ଥାନ ପୁଣି ଯାଞ୍ଚ କରନ୍ତୁ।",
  "Re-run this analysis after the next rain or in 3 days.":
    "ପରବର୍ତ୍ତୀ ବର୍ଷା ପରେ କିମ୍ବା 3 ଦିନ ପରେ ଏହି ବିଶ୍ଳେଷଣ ପୁଣି ଚଲାନ୍ତୁ।",
  "No urgent action — keep the weekly scouting routine.":
    "ତୁରନ୍ତ ପଦକ୍ଷେପ ନାହିଁ — ସାପ୍ତାହିକ ଯାଞ୍ଚ ଜାରି ରଖନ୍ତୁ।",
  "Young seedlings are easily set back by early pest damage":
    "ଛୋଟ ଚାରା ଆରମ୍ଭିକ ପୋକ କ୍ଷତିରେ ସହଜରେ ପଛାଇଯାଏ",
};
