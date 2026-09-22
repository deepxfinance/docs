'use client';

import { Children, cloneElement, createContext, Fragment, isValidElement, type ReactNode } from 'react';
import { Accordions } from '@fumadocs/api-docs/components/accordion';
import type { CreateOpenAPIPageOptions } from 'fumadocs-openapi/ui';

export const AutoExpandResponseContext = createContext(false);

// Keep Fumadocs' response content (including media selectors and TypeScript copy)
// and configure its response accordion through the operation layout slot.
export function expandSuccessResponse(responses: ReactNode): ReactNode {
  return Children.map(responses, (child) => {
    if (!isValidElement<{ children?: ReactNode; defaultValue?: string[] }>(child)) return child;
    if (child.type === Fragment) {
      return cloneElement(child, { children: expandSuccessResponse(child.props.children) });
    }
    if (child.type !== Accordions) return child;

    return cloneElement(child, {
      defaultValue: ['200'],
      children: Children.map(child.props.children, (response) => {
        const isSuccess = isValidElement<{ status?: string }>(response)
          && response.props.status === '200';
        return (
          <AutoExpandResponseContext value={isSuccess}>
            {response}
          </AutoExpandResponseContext>
        );
      }),
    });
  });
}

export const renderOperationLayout: NonNullable<NonNullable<CreateOpenAPIPageOptions['content']>['renderOperationLayout']> = (slots) => (
  <div className="flex flex-col gap-x-6 gap-y-4 @4xl:flex-row @4xl:items-start">
    <div className="min-w-0 flex-1">
      {slots.header}
      {slots.apiPlayground}
      {slots.description}
      {slots.authSchemes}
      {slots.parameters}
      {slots.body}
      {expandSuccessResponse(slots.responses)}
      {slots.callbacks}
    </div>
    <div className="@4xl:sticky @4xl:top-[calc(var(--fd-docs-row-1,2rem)+1rem)] @4xl:w-[400px]">
      {slots.apiExample}
    </div>
  </div>
);
