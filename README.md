# POP AI - Smart Text Predictions

![POP AI Logo](icon48.png)

POP AI is a powerful Chrome extension that provides intelligent text predictions as you type, helping you write faster and more efficiently across the web. It uses advanced AI to understand context and provide relevant suggestions for various types of content.

## Features

- **Smart Text Predictions**: Get AI-powered suggestions as you type in any text field
- **Context-Aware**: Understands different contexts (email, social media, job applications, etc.)
- **One-Tap Completion**: Accept suggestions with a single Tab key press
- **Works Everywhere**: Functions across all websites and text input fields
- **Ready-to-Use Templates**: Pre-built templates for common scenarios
- **Privacy-Focused**: Processes text locally when possible
- **Lightweight**: Minimal impact on browser performance

## Installation

1. Clone this repository:
```bash
git clone https://github.com/jagan607/pop-ai.git
```

2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the project directory

## Usage

1. Start typing in any text field on any website
2. Watch for gray text suggestions that appear as you type
3. Press `Tab` to accept a suggestion
4. Press `Esc` to dismiss a suggestion

## Supported Contexts

- **Email**: Smart completions for email composition
- **Social Media**: Context-aware suggestions for posts and comments
- **Job Applications**: Professional responses for common job application questions
- **Professional Communication**: Templates for business emails and messages
- **General Writing**: Intelligent completions for any text input

## Development

### Prerequisites

- Chrome browser
- Basic understanding of JavaScript
- Familiarity with Chrome Extension development

### Project Structure

```
pop-ai/
├── manifest.json        # Extension configuration
├── background.js       # Background service worker
├── content.js         # Content script for webpage interaction
├── popup.html         # Extension popup interface
├── popup.js          # Popup functionality
├── styles.css        # Styling for the extension
└── icons/           # Extension icons
```

### Building

1. Make your changes to the source files
2. Test the extension locally using Chrome's developer mode
3. Package the extension for distribution

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenAI for providing the AI capabilities
- The Chrome Extensions community for inspiration and support
- All contributors who have helped improve this project

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/jagan607/Pop-AI/issues) on GitHub. 