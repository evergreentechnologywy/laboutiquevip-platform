const isNode = typeof window === 'undefined';

const getAppParams = () => {
  if (isNode) {
    return {
      appId: null,
      serverUrl: '',
      token: null,
      fromUrl: '',
      functionsVersion: null,
    };
  }

  return {
    appId: null,
    serverUrl: '',
    token: localStorage.getItem('auth_token'),
    fromUrl: window.location.href,
    functionsVersion: null,
  };
};

export const appParams = {
  ...getAppParams(),
};
