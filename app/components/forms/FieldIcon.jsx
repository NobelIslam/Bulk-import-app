import {
  ButtonPressIcon,
  CalendarIcon,
  CheckboxIcon,
  EmailIcon,
  EyeCheckMarkIcon,
  HashtagIcon,
  ListBulletedIcon,
  MinusIcon,
  PhoneIcon,
  SelectIcon,
  ShieldCheckMarkIcon,
  StatusActiveIcon,
  TextBlockIcon,
  TextFontIcon,
  TextIcon,
  TextTitleIcon,
  UploadIcon,
} from "@shopify/polaris-icons";

// Maps the `icon` key on a field type in ./fields.js to a Polaris icon.
const ICONS = {
  text: TextFontIcon,
  textLong: TextBlockIcon,
  email: EmailIcon,
  phone: PhoneIcon,
  hash: HashtagIcon,
  calendar: CalendarIcon,
  upload: UploadIcon,
  eye: EyeCheckMarkIcon,
  list: SelectIcon,
  radio: StatusActiveIcon,
  checkbox: CheckboxIcon,
  checkboxGroup: ListBulletedIcon,
  shield: ShieldCheckMarkIcon,
  heading: TextTitleIcon,
  paragraph: TextBlockIcon,
  divider: MinusIcon,
  button: ButtonPressIcon,
};

const COLORS = {
  subdued: "#616161",
  base: "#303030",
};

// polaris-icons components spread props onto <svg> and ignore `size`/`color`,
// so the size and fill have to be set as real SVG attributes.
export default function FieldIcon({ name, color = "base", size = 20 }) {
  const Icon = ICONS[name] || TextIcon;
  return (
    <Icon
      width={size}
      height={size}
      fill={COLORS[color] || color}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}
