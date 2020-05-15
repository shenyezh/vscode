/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { sep } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { isUNC } from 'vs/base/common/extpath';
import { getWebviewContentMimeType } from 'vs/platform/webview/common/mimeTypes';
import { Schemas } from 'vs/base/common/network';

export namespace WebviewResourceResponse {
	export enum Type { Success, Failed, AccessDenied }

	export class Success {
		readonly type = Type.Success;

		constructor(
			public readonly data: VSBuffer,
			public readonly mimeType: string
		) { }
	}

	export const Failed = { type: Type.Failed } as const;
	export const AccessDenied = { type: Type.AccessDenied } as const;

	export type Response = Success | typeof Failed | typeof AccessDenied;

}
async function resolveContent(
	fileService: IFileService,
	resource: URI,
	mime: string
): Promise<WebviewResourceResponse.Response> {
	try {
		const contents = await fileService.readFile(resource);
		return new WebviewResourceResponse.Success(contents.value, mime);
	} catch (err) {
		console.log(err);
		return WebviewResourceResponse.Failed;
	}
}

export async function loadLocalResource(
	requestUri: URI,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	roots: ReadonlyArray<URI>
): Promise<WebviewResourceResponse.Response> {
	const normalizedPath = normalizeRequestPath(requestUri);

	for (const root of roots) {
		if (!containsResource(root, normalizedPath)) {
			continue;
		}

		if (extensionLocation && extensionLocation.scheme === REMOTE_HOST_SCHEME) {
			const redirectedUri = URI.from({
				scheme: REMOTE_HOST_SCHEME,
				authority: extensionLocation.authority,
				path: '/vscode-resource',
				query: JSON.stringify({
					requestResourcePath: normalizedPath.path
				})
			});
			return resolveContent(fileService, redirectedUri, getWebviewContentMimeType(requestUri));
		} else {
			return resolveContent(fileService, normalizedPath, getWebviewContentMimeType(normalizedPath));
		}
	}

	return WebviewResourceResponse.AccessDenied;
}

function normalizeRequestPath(requestUri: URI) {
	if (requestUri.scheme !== Schemas.vscodeWebviewResource) {
		return requestUri;
	}

	// The `vscode-webview-resource` schemes encodes both the scheme and uri:
	const resourceUri = URI.parse(requestUri.path.replace(/\/+(\w+)\/\//, '$1://'));
	return resourceUri.with({
		query: requestUri.query,
		fragment: requestUri.fragment
	});
}

function containsResource(root: URI, resource: URI): boolean {
	let rootPath = root.fsPath + (root.fsPath.endsWith(sep) ? '' : sep);
	let resourceFsPath = resource.fsPath;

	if (isUNC(root.fsPath) && isUNC(resource.fsPath)) {
		rootPath = rootPath.toLowerCase();
		resourceFsPath = resourceFsPath.toLowerCase();
	}

	return resourceFsPath.startsWith(rootPath);
}
