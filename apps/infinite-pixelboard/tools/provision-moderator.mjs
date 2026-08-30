import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_PROJECT_ID = "collapse-technologies";
export const OPERATOR_EMAIL = "juanquirinoc@gmail.com";

const usage = `Provision the Pixelboard moderator claim for the one approved operator.

Dry run (default; does not change Firebase):
  npm run provision:pixelboard-moderator -- --project ${EXPECTED_PROJECT_ID} \\
    --email ${OPERATOR_EMAIL} --confirm-email ${OPERATOR_EMAIL} --dry-run

Apply after the dry run reports the expected UID:
  npm run provision:pixelboard-moderator -- --project ${EXPECTED_PROJECT_ID} \\
    --email ${OPERATOR_EMAIL} --confirm-email ${OPERATOR_EMAIL} \\
    --uid <uid-from-dry-run> --confirm-uid <uid-from-dry-run> --apply

Authentication uses Firebase Admin SDK Application Default Credentials. Keep the
service-account key outside the repository and set GOOGLE_APPLICATION_CREDENTIALS
to its path, or use an equivalent ADC provider.
`;

function requiredValue(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseArguments(arguments_) {
  const options = {
    project: null,
    email: null,
    confirmEmail: null,
    uid: null,
    confirmUid: null,
    apply: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    switch (argument) {
      case "--project":
        options.project = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--email":
        options.email = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--confirm-email":
        options.confirmEmail = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--uid":
        options.uid = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--confirm-uid":
        options.confirmUid = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.help) return options;
  if (options.apply && options.dryRun) {
    throw new Error("--apply and --dry-run cannot be used together.");
  }
  if (options.project !== EXPECTED_PROJECT_ID) {
    throw new Error(`--project must be exactly ${EXPECTED_PROJECT_ID}.`);
  }
  if (options.email !== OPERATOR_EMAIL) {
    throw new Error(`--email must be exactly ${OPERATOR_EMAIL}.`);
  }
  if (options.confirmEmail !== OPERATOR_EMAIL) {
    throw new Error(`--confirm-email must be exactly ${OPERATOR_EMAIL}.`);
  }
  if ((options.uid && options.confirmUid !== options.uid)
    || (!options.uid && options.confirmUid)) {
    throw new Error("--confirm-uid must exactly match --uid.");
  }
  if (options.apply && !options.uid) {
    throw new Error("--apply requires --uid and --confirm-uid from a dry run.");
  }

  return options;
}

export function validateTarget(user, options) {
  if (!user || user.email !== OPERATOR_EMAIL) {
    throw new Error("Firebase did not return the exact approved operator email.");
  }
  if (options.uid && user.uid !== options.uid) {
    throw new Error(
      `UID mismatch: Firebase returned ${user.uid}, not the confirmed UID.`,
    );
  }
  if (user.disabled) {
    throw new Error("The approved operator account is disabled.");
  }
  if (!user.emailVerified) {
    throw new Error("The approved operator email is not verified.");
  }
  const providerIds = new Set((user.providerData ?? []).map(
    (provider) => provider.providerId,
  ));
  if (!providerIds.has("google.com")) {
    throw new Error("The approved operator account is not linked to Google.");
  }
  return user;
}

export async function provisionModerator(auth, options, output = console) {
  const user = validateTarget(
    await auth.getUserByEmail(OPERATOR_EMAIL),
    options,
  );
  const claims = user.customClaims ?? {};
  const alreadyModerator = claims.moderator === true;

  output.log(`Verified Firebase account: ${user.email} (${user.uid})`);
  output.log("Verified provider: google.com");
  output.log(`Current moderator claim: ${alreadyModerator ? "true" : "absent/false"}`);

  if (!options.apply) {
    output.log("Dry run: no Firebase changes were made.");
    return { changed: false, uid: user.uid };
  }
  if (alreadyModerator) {
    output.log("No change needed: moderator claim is already true.");
    return { changed: false, uid: user.uid };
  }

  await auth.setCustomUserClaims(user.uid, {
    ...claims,
    moderator: true,
  });
  output.log("Set moderator=true for the confirmed operator UID.");
  output.log("The operator must refresh or sign in again to receive a new ID token.");
  return { changed: true, uid: user.uid };
}

export async function main(arguments_ = process.argv.slice(2), output = console) {
  try {
    const options = parseArguments(arguments_);
    if (options.help) {
      output.log(usage);
      return 0;
    }

    const app = initializeApp({
      credential: applicationDefault(),
      projectId: options.project,
    });
    await provisionModerator(getAuth(app), options, output);
    return 0;
  } catch (error) {
    output.error(`Moderator provisioning failed: ${error.message}`);
    output.error(usage);
    return 1;
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
