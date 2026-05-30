((nil
  . (
     (eval . (let ((project-directory (car (dir-locals-find-file default-directory))))
							 (eval-after-load 'lsp-typescript
								 '(progn
										(plist-put lsp-deps-providers
															 :local (list :path (lambda (path) (concat project-directory ".yarn/sdks/" path))))

										(lsp-dependency 'typescript-language-server
																		'(:local "typescript-language-server/lib/cli.js"))
										(lsp-dependency 'typescript
																		'(:local "typescript/bin/tsserver"))))
							 )))))
