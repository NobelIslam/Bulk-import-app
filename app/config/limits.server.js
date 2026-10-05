// Central plan/limits configuration.
//
// Every limit in the app is read from this file — nothing is hardcoded at call
// sites. The map is shaped for multiple plans so billing can be added later
// without touching feature code.

export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    forms: 25,
    submissionsPerMonth: 5000,
    maxFieldsPerForm: 60,
  },
};

// Development stage: one plan for every shop. Billing plugs in here — resolve
// the shop's active subscription and return its key. Features keep reading
// PLANS either way, so nothing else has to change.
export function getPlanKeyForShop() {
  return "free";
}

export function getPlanForShop(shop) {
  return PLANS[getPlanKeyForShop(shop)] || PLANS.free;
}

export function getPlan(planKey) {
  return PLANS[planKey] || PLANS.free;
}

export function formatLimit(value) {
  return Number(value).toLocaleString();
}

// Returns null when within limits, otherwise a merchant-readable reason.
export function checkFormLimit(currentFormCount) {
  const plan = getPlanForShop();
  if (currentFormCount >= plan.forms) {
    return `You have reached the limit of ${formatLimit(plan.forms)} forms on the ${plan.label} plan.`;
  }
  return null;
}

export function checkSubmissionLimit(submissionsThisMonth) {
  const plan = getPlanForShop();
  if (submissionsThisMonth >= plan.submissionsPerMonth) {
    return `You have reached the limit of ${formatLimit(plan.submissionsPerMonth)} submissions per month on the ${plan.label} plan.`;
  }
  return null;
}

export function checkFieldLimit(fieldCount) {
  const plan = getPlanForShop();
  if (fieldCount > plan.maxFieldsPerForm) {
    return `A form can contain up to ${formatLimit(plan.maxFieldsPerForm)} fields.`;
  }
  return null;
}