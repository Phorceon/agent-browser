# AGENTS.md

## Overview

This document describes the agents used in the repo-loop system and provides guidelines for their operation.

## Agents

- **Summarizer Agent**: Generates summaries of changes in the repository.
- **Reviewer Agent**: Reviews code for issues, including bugs, style, and security.
- **Fixer Agent**: Applies fixes based on reviews, ensuring changes are correct and minimal.

## Error Handling

To prevent agent failures and ensure reliability, agents must validate input before processing:
- Check for null or undefined values.
- Handle exceptions gracefully with appropriate logging.
- Validate data types and formats to avoid runtime errors.

This guard helps maintain system stability and reduces the risk of cascading failures.